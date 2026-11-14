// Spielplan aus einer CSV-Datei übernehmen (Lastenheft 1.4).
//
//   POST /api/events/import-csv
//   Body: { teamId, csv: "<Dateiinhalt>", dryRun?: boolean }
//
// Gedacht für Mannschaften ohne nuLiga-Anbindung (Turniere, Freundschafts-
// spiele, Jugendrunden) oder als Ersatz, wenn nuLiga nicht erreichbar ist.
// Mit dryRun = true kommt nur die Vorschau zurück – gespeichert wird nichts.
//
// Verstanden werden Export-Dateien aus nuLiga/Excel ebenso wie selbst
// geschriebene Tabellen. Trennzeichen: Semikolon, Komma oder Tabulator.
// Spalten (Reihenfolge egal, Groß-/Kleinschreibung egal):
//   Datum            12.09.2026 | 12.09.26 | 2026-09-12 | „Sa. 12.09.2026"
//   Zeit / Uhrzeit   18:00 | 18.00 | 18:00 Uhr   (fehlt sie: 00:00)
//   Heim, Gast       Mannschaftsnamen  – oder eine Spalte „Begegnung"/„Titel"
//   Halle / Ort      optional
//   Ende / Dauer     optional (Dauer in Minuten), sonst 90 Minuten
const eventRepository = require('../repositories/eventRepository');
const teamAccess = require('../services/teamAccess');
const { viewerOf } = require('../access/service');
const appEvents = require('../services/appEvents');
const { addMinutesToSql } = require('../utils/schedule');

const MAX_ROWS = 300;
const DEFAULT_MINUTES = 90;

const COLUMN_NAMES = {
  date: ['datum', 'date', 'tag', 'spieltag', 'termin'],
  time: ['zeit', 'uhrzeit', 'anwurf', 'beginn', 'time', 'start'],
  home: ['heim', 'heimmannschaft', 'heimverein', 'home'],
  guest: ['gast', 'gastmannschaft', 'gastverein', 'gegner', 'guest', 'away'],
  title: ['begegnung', 'titel', 'spiel', 'paarung', 'title'],
  location: ['halle', 'hallenname', 'ort', 'spielort', 'spielstätte', 'spielstaette', 'location'],
  end: ['ende', 'end'],
  duration: ['dauer', 'minuten', 'duration'],
};

/** Zerlegt CSV-Text in Zeilen und Felder (mit Anführungszeichen-Regeln). */
function parseCsv(text) {
  const clean = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = clean.split('\n').find((line) => line.trim()) ?? '';
  const delimiter = [';', '\t', ','].sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length
  )[0];

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some(Boolean));
}

function readDate(value) {
  const text = String(value ?? '');
  let match = /(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/.exec(text);
  let parts = match ? [match[3].length === 2 ? `20${match[3]}` : match[3], match[2], match[1]] : null;
  if (!parts) {
    match = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    parts = match ? [match[1], match[2], match[3]] : null;
  }
  if (!parts) return null;
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function readTime(value) {
  const match = /(\d{1,2})[:.](\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  const [h, min] = [Number(match[1]), Number(match[2])];
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00` : null;
}

/**
 * CSV -> Spiele. Fehlerhafte Zeilen werden mit Zeilennummer gemeldet, die
 * übrigen trotzdem übernommen.
 */
function readMatches(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, message: 'Die Datei enthält keine Spiele (Kopfzeile und mindestens eine Zeile erwartet).' };

  const header = rows[0].map((cell) => cell.toLowerCase().replace(/[^a-zäöüß]/g, ''));
  const column = (key) => header.findIndex((name) => COLUMN_NAMES[key].includes(name));
  const index = Object.fromEntries(Object.keys(COLUMN_NAMES).map((key) => [key, column(key)]));

  if (index.date < 0) return { ok: false, message: 'Spalte „Datum" nicht gefunden. Bitte eine Kopfzeile mit Datum, Zeit, Heim, Gast und Halle verwenden.' };
  if (index.title < 0 && (index.home < 0 || index.guest < 0)) {
    return { ok: false, message: 'Spalten „Heim" und „Gast" (oder „Begegnung") nicht gefunden.' };
  }
  if (rows.length - 1 > MAX_ROWS) return { ok: false, message: `Höchstens ${MAX_ROWS} Spiele pro Datei.` };

  const matches = [];
  const errors = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const cell = (key) => (index[key] >= 0 ? cells[index[key]] ?? '' : '');
    const date = readDate(cell('date'));
    if (!date) return errors.push({ line, message: `Datum „${cell('date')}" nicht lesbar.` });
    // Manche Exporte schreiben Datum und Uhrzeit in dieselbe Spalte.
    const time = readTime(cell('time')) ?? readTime(cell('date').replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/, '')) ?? '00:00:00';

    const title = (cell('title') || [cell('home'), cell('guest')].filter(Boolean).join(' – ')).slice(0, 120);
    if (!title) return errors.push({ line, message: 'Heim- und Gastmannschaft fehlen.' });

    const startTime = `${date} ${time}`;
    const endClock = readTime(cell('end'));
    const minutes = Number.parseInt(cell('duration'), 10);
    let endTime = endClock ? `${date} ${endClock}` : addMinutesToSql(startTime, minutes > 0 && minutes <= 1440 ? minutes : DEFAULT_MINUTES);
    if (endTime <= startTime) endTime = addMinutesToSql(startTime, DEFAULT_MINUTES);

    return matches.push({ line, title, location: cell('location').slice(0, 120) || null, startTime, endTime });
  });

  return { ok: true, matches, errors };
}

async function importCsv(req, res, next) {
  try {
    const teamId = Number(req.body?.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) return res.status(400).json({ message: 'Ungültige Mannschafts-ID.' });
    if (typeof req.body?.csv !== 'string' || !req.body.csv.trim()) {
      return res.status(400).json({ message: 'Bitte eine CSV-Datei auswählen.' });
    }

    const access = await teamAccess.requireManager(viewerOf(req), teamId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const parsed = readMatches(req.body.csv);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    if (req.body.dryRun) {
      return res.json({ dryRun: true, matches: parsed.matches, errors: parsed.errors });
    }
    if (parsed.matches.length === 0) return res.status(400).json({ message: 'Keine Zeile der Datei war lesbar.', errors: parsed.errors });

    const result = await eventRepository.importMatches(teamId, parsed.matches, req.userId);
    if (result.created > 0) {
      appEvents.publish('event.created', { teamId, seriesId: null, eventId: null, actorId: req.userId });
    }
    return res.status(201).json({
      message: `${result.created} ${result.created === 1 ? 'Spiel' : 'Spiele'} übernommen${result.skipped ? `, ${result.skipped} waren schon im Kalender` : ''}.`,
      ...result,
      errors: parsed.errors,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { importCsv, readMatches };
