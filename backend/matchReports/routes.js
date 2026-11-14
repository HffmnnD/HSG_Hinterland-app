// /api/match-reports – Spielberichte (langer Text, Bilder/PDF, Spielverknüpfung).
// Sie erscheinen unter Verein → Infos und auf der Spielseite des verknüpften Spiels.
//
//   GET    /                            neueste Berichte aller Mannschaften (?limit=&offset=)
//   GET    /meta                        Mannschaften, für die man Berichte schreiben darf
//   GET    /?teamId=                    Berichte einer Mannschaft (neuester zuerst)
//   GET    /by-meeting/:meetingId       Berichte zu einem Spiel (für die Spielseite)
//   GET    /:id                         ein Bericht
//   GET    /:id/files/:fileId           Datei ansehen (?download=1 -> herunterladen)
//   POST   /?teamId=                    anlegen (multipart: Felder + files[], Dateien optional)
//   PATCH  /:id                         Angaben ändern (JSON)
//   POST   /:id/files                   Dateien ergänzen (multipart)
//   DELETE /:id/files/:fileId           eine Datei entfernen
//   DELETE /:id                         Bericht löschen (samt Dateien)
//
// Rechte:
//   lesen     alle angemeldeten Konten – Spielberichte sind Vereinsöffentlichkeit
//             wie die News.
//   schreiben Trainer:innen der Mannschaft, die Vereinsverwaltung
//             (teams.manage_all) sowie wer News oder Vereinsinfos pflegt
//             (news.manage, board.manage) – nicht, solange Eltern als Kind handeln.
const express = require('express');
const fs = require('fs');
const { rateLimit } = require('express-rate-limit');

const { authenticate, forbidWhileActingAs } = require('../middleware/authMiddleware');
const { viewerOf } = require('../access/service');
const teamAccess = require('../services/teamAccess');
const teamRepository = require('../repositories/teamRepository');
const { parseId } = require('../utils/validation');
const { isValidGameId, decodeGameId } = require('../config/handball');
const repository = require('./repository');
const upload = require('./upload');

const router = express.Router();
router.use(authenticate);

// Uploads sind teuer (bis 10 × 15 MB) – pro Konto begrenzen.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Uploads in kurzer Zeit. Bitte später erneut versuchen.' },
});

const NOT_FOUND = { message: 'Spielbericht nicht gefunden.' };
const MANAGE_DENIED = 'Nur Trainer:innen dieser Mannschaft dürfen Spielberichte verwalten.';
const PAGE_MAX = 50;

/** Darf vereinsweit Berichte für jede Mannschaft schreiben (Redaktion)? */
function isEditor(req) {
  const perms = req.access?.permissions;
  return Boolean(perms?.has('news.manage') || perms?.has('board.manage'));
}

/** Schreibrecht für eine Mannschaft: Redaktion oder Trainer:in/Verwaltung. */
async function canManageTeam(req, teamId) {
  if (isEditor(req)) return { ok: true, canManage: true };
  return teamAccess.requireManager(viewerOf(req), teamId, MANAGE_DENIED);
}

// ------------------------------------------------------------ Eingaben --

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function cleanText(value, max) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\r\n/g, '\n').trim();
  return text ? text.slice(0, max) : null;
}

function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? `${match[1]}-${match[2]}-${match[3]}`
    : null;
}

function parseIsHome(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return null;
}

/**
 * Prüft die Angaben eines Berichts.
 * @param {object} body Formular- oder JSON-Felder
 * @param {boolean} partial true = nur übergebene Felder (PATCH)
 * @returns {{ ok:true, data:object } | { ok:false, message:string }}
 */
function validate(body, partial = false) {
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('title')) {
    const title = cleanText(body.title, 160);
    if (!title) return { ok: false, message: 'Bitte einen Titel angeben.' };
    data.title = title;
  }
  if (!partial || has('opponent')) {
    const opponent = cleanText(body.opponent, 120);
    if (!opponent) return { ok: false, message: 'Bitte den Gegner angeben.' };
    data.opponent = opponent;
  }
  if (!partial || has('gameDate')) {
    const gameDate = parseDate(body.gameDate);
    if (!gameDate) return { ok: false, message: 'Bitte ein gültiges Spieldatum (JJJJ-MM-TT) angeben.' };
    data.gameDate = gameDate;
  }
  if (!partial || has('isHome')) data.isHome = parseIsHome(body.isHome);
  if (!partial || has('summary')) data.summary = cleanText(body.summary, 300);
  if (!partial || has('body')) data.body = cleanText(body.body, 100000);

  // Verknüpfung mit dem Spiel: App-Spiel-ID aus dem Spielplan (bevorzugt)
  // oder nur die nuLiga-Spielnummer.
  if (!partial || has('gameId') || has('meetingId')) {
    const gameId = cleanText(body.gameId, 160);
    if (gameId) {
      if (!isValidGameId(gameId)) return { ok: false, message: 'Ungültige Spiel-ID.' };
      data.gameId = gameId;
      data.meetingId = decodeGameId(gameId)?.meeting ?? null;
    } else {
      const meetingId = cleanText(body.meetingId, 12);
      if (meetingId && !/^\d{1,12}$/.test(meetingId)) {
        return { ok: false, message: 'Ungültige Spielnummer.' };
      }
      data.gameId = null;
      data.meetingId = meetingId;
    }
  }
  return { ok: true, data };
}

const fileRecords = (files) =>
  files.map((file) => ({
    path: upload.relativePath(file),
    mimeType: file.mimetype,
    originalName: upload.safeOriginalName(file.originalname),
    sizeBytes: file.size,
  }));

// --------------------------------------------------------------- Zugriff --

/** Bericht laden + Lese- bzw. Schreibrecht prüfen. Antwortet selbst bei Fehlern. */
async function loadWithAccess(req, res, { manage = false } = {}) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  const report = await repository.findById(id);
  if (!report) {
    res.status(404).json(NOT_FOUND);
    return null;
  }
  const access = await canManageTeam(req, report.teamId);
  if (manage && !access.ok) {
    res.status(access.status).json({ message: access.message });
    return null;
  }
  return { report, access: { canManage: access.ok } };
}

// ---------------------------------------------------------------- Lesen --

router.get('/meta', async (req, res, next) => {
  try {
    const teams = isEditor(req)
      ? await teamRepository.listAll()
      : (await teamAccess.listAccessibleTeams(viewerOf(req))).filter((team) => team.canManage);
    return res.json({
      teams: teams.map((team) => ({ id: team.id, code: team.code, name: team.name, handballTeamId: team.handballTeamId ?? null })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const teamId = parseId(req.query.teamId);
    if (!teamId) {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), PAGE_MAX);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const reports = await repository.listRecent({ limit: limit + 1, offset });
      const rights = new Map();
      const withRights = [];
      for (const report of reports.slice(0, limit)) {
        if (!rights.has(report.teamId)) rights.set(report.teamId, (await canManageTeam(req, report.teamId)).ok);
        withRights.push({ ...report, canManage: rights.get(report.teamId) });
      }
      return res.json({ reports: withRights, hasMore: reports.length > limit });
    }
    const access = await canManageTeam(req, teamId);
    const reports = await repository.listForTeam(teamId);
    return res.json({ reports, canManage: access.ok });
  } catch (err) {
    return next(err);
  }
});

router.get('/by-meeting/:meetingId', async (req, res, next) => {
  try {
    const { meetingId } = req.params;
    if (!/^\d{1,12}$/.test(meetingId)) return res.status(400).json({ message: 'Ungültige Spielnummer.' });
    const reports = await repository.listForMeeting(meetingId);
    const withRights = [];
    for (const report of reports) {
      withRights.push({ ...report, canManage: (await canManageTeam(req, report.teamId)).ok });
    }
    return res.json({ reports: withRights });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const loaded = await loadWithAccess(req, res);
    if (!loaded) return undefined;
    return res.json({ report: loaded.report, canManage: loaded.access.canManage });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/files/:fileId', async (req, res, next) => {
  try {
    const loaded = await loadWithAccess(req, res);
    if (!loaded) return undefined;
    const fileId = parseId(req.params.fileId);
    const file = fileId ? await repository.findFile(loaded.report.id, fileId) : null;
    const absolute = file ? upload.resolveStored(file.file_path) : null;
    if (!absolute || !fs.existsSync(absolute)) return res.status(404).json({ message: 'Datei nicht gefunden.' });

    const download = req.query.download === '1';
    const ext = upload.ALLOWED.get(file.mime_type)?.ext ?? '';
    const name = (file.original_name || `spielbericht-${loaded.report.id}-${file.id}${ext}`).replace(/"/g, '');
    res.set({
      'Content-Type': file.mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    return res.sendFile(absolute);
  } catch (err) {
    return next(err);
  }
});

// ------------------------------------------------------------ Schreiben --

/**
 * Rechteprüfung VOR dem Datei-Empfang: Die Mannschaft steht im Query-String
 * (?teamId=), damit Unberechtigte gar nicht erst Dateien auf die Platte
 * schreiben können.
 */
async function requireManagerFromQuery(req, res, next) {
  try {
    const teamId = parseId(req.query.teamId);
    if (!teamId) return res.status(400).json({ message: 'teamId fehlt.' });
    const access = await canManageTeam(req, teamId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    req.matchReportTeamId = teamId;
    return next();
  } catch (err) {
    return next(err);
  }
}

router.post('/', forbidWhileActingAs, uploadLimiter, requireManagerFromQuery, upload.receiveFiles, async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    const teamId = req.matchReportTeamId;
    const checked = validate(req.body ?? {});
    if (!checked.ok) {
      await upload.discard(files);
      return res.status(400).json({ message: checked.message });
    }
    if (!checked.data.body && files.length === 0) {
      return res.status(400).json({ message: 'Bitte den Berichtstext schreiben oder eine Datei anhängen.' });
    }
    if (files.length > 0 && !(await upload.verifyFiles(files))) {
      await upload.discard(files);
      return res.status(400).json({ message: 'Eine Datei ist kein gültiges PDF bzw. Bild.' });
    }

    const id = await repository.create(
      { ...checked.data, teamId, uploadedBy: req.userId },
      fileRecords(files)
    );
    return res.status(201).json({ report: await repository.findById(id) });
  } catch (err) {
    await upload.discard(files);
    return next(err);
  }
});

router.patch('/:id', forbidWhileActingAs, async (req, res, next) => {
  try {
    const loaded = await loadWithAccess(req, res, { manage: true });
    if (!loaded) return undefined;
    const checked = validate(req.body ?? {}, true);
    if (!checked.ok) return res.status(400).json({ message: checked.message });
    // Mannschaft wechseln (falsch zugeordnet) – nur wenn man auch dort schreiben darf.
    const newTeamId = parseId(req.body?.teamId);
    if (newTeamId && newTeamId !== loaded.report.teamId) {
      const target = await canManageTeam(req, newTeamId);
      if (!target.ok) return res.status(target.status ?? 403).json({ message: target.message ?? MANAGE_DENIED });
      checked.data.teamId = newTeamId;
    }
    await repository.update(loaded.report.id, checked.data);
    return res.json({ report: await repository.findById(loaded.report.id) });
  } catch (err) {
    return next(err);
  }
});

/** Bericht laden und Schreibrecht prüfen – VOR dem Datei-Empfang. */
async function requireManagedReport(req, res, next) {
  try {
    const loaded = await loadWithAccess(req, res, { manage: true });
    if (!loaded) return undefined;
    req.loadedReport = loaded;
    return next();
  } catch (err) {
    return next(err);
  }
}

router.post('/:id/files', forbidWhileActingAs, uploadLimiter, requireManagedReport, upload.receiveFiles, async (req, res, next) => {
  const files = Array.isArray(req.files) ? req.files : [];
  try {
    const loaded = req.loadedReport;
    if (files.length === 0) return res.status(400).json({ message: 'Keine Datei angehängt.' });
    const { count } = await repository.countFiles(loaded.report.id);
    if (count + files.length > 30) {
      await upload.discard(files);
      return res.status(400).json({ message: 'Höchstens 30 Dateien je Spielbericht.' });
    }
    if (!(await upload.verifyFiles(files))) {
      await upload.discard(files);
      return res.status(400).json({ message: 'Eine Datei ist kein gültiges PDF bzw. Bild.' });
    }
    await repository.addFiles(loaded.report.id, fileRecords(files));
    return res.status(201).json({ report: await repository.findById(loaded.report.id) });
  } catch (err) {
    await upload.discard(files);
    return next(err);
  }
});

router.delete('/:id/files/:fileId', forbidWhileActingAs, async (req, res, next) => {
  try {
    const loaded = await loadWithAccess(req, res, { manage: true });
    if (!loaded) return undefined;
    const fileId = parseId(req.params.fileId);
    const stored = fileId ? await repository.removeFile(loaded.report.id, fileId) : null;
    if (!stored) return res.status(404).json({ message: 'Datei nicht gefunden.' });
    await upload.removeUpload(stored);
    return res.json({ report: await repository.findById(loaded.report.id) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', forbidWhileActingAs, async (req, res, next) => {
  try {
    const loaded = await loadWithAccess(req, res, { manage: true });
    if (!loaded) return undefined;
    const paths = await repository.remove(loaded.report.id);
    for (const stored of paths) await upload.removeUpload(stored);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
