// Konfiguration für die Anbindung an nuLiga (HHV – Hessischer Handball-Verband).
//
// Quelle ist seit der Umstellung von handball.net das nuLiga-Portal des HHV.
// nuLiga hat keine JSON-Schnittstelle – die Daten werden aus dem HTML der
// öffentlichen Seiten gelesen (siehe services/handballClient.js und
// services/handballMapper.js). Daraus folgen drei Regeln für dieses Modul:
//
//   1. Alle URLs stehen NUR hier. Ändert nuLiga seine Adressen, ist das eine
//      Änderung an genau einer Datei.
//   2. Der Mapper arbeitet spaltenkopf- und inhaltsgesteuert, nie über feste
//      Spaltennummern – nuLiga verschiebt Spalten je nach Spielstatus.
//   3. Es wird konsequent gecacht. nuLiga liefert vollständige HTML-Seiten
//      (40–55 KB pro Abruf); jeder gesparte Request ist fair play und schnell.
//
// Alle Werte lassen sich per .env überschreiben, ohne Code anzufassen.

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// Basis des Verbandsportals. Ohne abschließenden Slash.
const BASE_URL = (
  process.env.NULIGA_BASE_URL || 'https://hhv-handball.liga.nu'
).replace(/\/+$/, '');

// Pfad der WebObjects-Anwendung. Steht separat, weil nuLiga ihn bei
// Versionswechseln schon einmal angefasst hat.
const APP_PATH =
  process.env.NULIGA_APP_PATH || '/cgi-bin/WebObjects/nuLigaHBDE.woa/wa';

// Namen der Seiten („Direct Actions"). Reihenfolge und Bedeutung:
//   teamPortrait   Mannschaftsseite: Spielplan + Link auf die eigene Staffel
//   groupPage      Staffelseite: Tabelle + Gesamtspielplan
//   meetingReport  Spielbericht: Ergebnis + Spielverlauf (unser Live-Ticker)
const PAGES = {
  teamPortrait: process.env.NULIGA_PAGE_TEAM || 'teamPortrait',
  groupPage: process.env.NULIGA_PAGE_GROUP || 'groupPage',
  meetingReport: process.env.NULIGA_PAGE_MEETING || 'groupMeetingReport',
};

// Cache-Zeiten in Sekunden (unverändert gegenüber der handball.net-Anbindung).
const TTL = {
  table: toInt(process.env.HANDBALL_TTL_TABLE, 900), // 15 Minuten
  schedule: toInt(process.env.HANDBALL_TTL_SCHEDULE, 900), // 15 Minuten
  tickerLive: toInt(process.env.HANDBALL_TTL_TICKER_LIVE, 10), // 10 Sekunden
  tickerIdle: toInt(process.env.HANDBALL_TTL_TICKER_IDLE, 600), // 10 Minuten
};

// Notreserve: so lange wird der letzte erfolgreiche Stand aufgehoben und bei
// einem Ausfall als „veraltet" ausgeliefert.
const STALE_TTL = toInt(process.env.HANDBALL_STALE_TTL, 24 * 60 * 60);

// Abbruch nach diesem Timeout. HTML-Seiten sind größer als JSON, deshalb
// etwas großzügiger als zuvor.
const REQUEST_TIMEOUT_MS = toInt(process.env.HANDBALL_TIMEOUT_MS, 10000);

// nuLiga beantwortet Requests mit knappem User-Agent teilweise mit 403.
// Ein vollständiger Browser-UA plus Kontaktkennung: erkennbar, aber akzeptiert.
const USER_AGENT =
  process.env.HANDBALL_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/131.0.0.0 Safari/537.36 HSG-Hinterland-App/1.0 (+https://hsg-hinterland.de)';

// Reguläre Spieldauer in Minuten – trennt 1. und 2. Halbzeit im Spielverlauf.
const HALFTIME_MINUTES = toInt(process.env.HANDBALL_HALFTIME_MINUTES, 30);

// So lange nach Anwurf gilt ein Spiel ohne veröffentlichtes Ergebnis noch als
// „läuft". Danach ist es beendet, der Bericht aber offenbar noch nicht
// freigegeben – ein dauerhaft rotes LIVE-Badge wäre schlicht falsch.
const LIVE_WINDOW_MINUTES = toInt(process.env.HANDBALL_LIVE_WINDOW_MINUTES, 150);

// ------------------------------------------------------------------- IDs ---
//
// Mannschafts-ID = nuLigas `teamtable` (rein numerisch). Die Seite
// `teamPortrait?teamtable=<id>` funktioniert damit allein – deshalb bleibt der
// Frontend-Vertrag `/api/handball/table/:teamId` unverändert.
const TEAM_ID_PATTERN = /^\d{1,12}$/;

// Spiel-ID: `groupMeetingReport` braucht ZWINGEND meeting + championship +
// group (mit nur einem oder zwei Parametern antwortet nuLiga mit 404). Die
// drei Werte werden deshalb zu einer einzigen, URL-tauglichen ID verschmolzen:
//
//     <meeting>.<group>.<championship als base64url>
//     z. B. 7929810.421558.SEhWIDI1LzI2      ("HHV 25/26")
//
// base64url deshalb, weil Meisterschaftsnamen Leerzeichen und Schrägstriche
// enthalten ("HHV 25/26") – das Alphabet A–Z a–z 0–9 - _ passt dagegen exakt
// in einen Pfadabschnitt und ist verlustfrei umkehrbar. Die IDs baut immer der
// Mapper beim Auslesen des Spielplans; das Frontend reicht sie nur zurück.
const GAME_ID_PATTERN = /^\d{1,12}\.\d{1,12}\.[A-Za-z0-9_-]{1,120}$/;

/** @returns {boolean} true, wenn die Mannschafts-ID gefahrlos in eine URL darf. */
function isValidTeamId(value) {
  return typeof value === 'string' && TEAM_ID_PATTERN.test(value);
}

/** @returns {boolean} true, wenn die zusammengesetzte Spiel-ID wohlgeformt ist. */
function isValidGameId(value) {
  return typeof value === 'string' && GAME_ID_PATTERN.test(value);
}

/**
 * Baut die zusammengesetzte Spiel-ID.
 * @param {{ meeting:string, group:string, championship:string }} parts
 * @returns {string|null} null, wenn ein Teil fehlt
 */
function encodeGameId({ meeting, group, championship }) {
  if (!meeting || !group || !championship) return null;
  const token = Buffer.from(String(championship), 'utf8').toString('base64url');
  const id = `${meeting}.${group}.${token}`;
  return isValidGameId(id) ? id : null;
}

/**
 * Zerlegt die Spiel-ID wieder in ihre drei Bestandteile.
 * @param {string} gameId
 * @returns {{ meeting:string, group:string, championship:string }|null}
 */
function decodeGameId(gameId) {
  if (!isValidGameId(gameId)) return null;
  const [meeting, group, token] = gameId.split('.');
  const championship = Buffer.from(token, 'base64url').toString('utf8');
  // Leerer oder unlesbarer Meisterschaftsname -> lieber ablehnen als eine
  // kaputte URL an nuLiga schicken.
  return championship.trim() ? { meeting, group, championship } : null;
}

// ------------------------------------------------------------------ URLs ---

/** Absolute URL einer nuLiga-Seite mit Query-Parametern. */
function buildUrl(page, params) {
  const name = PAGES[page];
  if (!name) throw new Error(`Unbekannte nuLiga-Seite: ${page}`);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  return `${BASE_URL}${APP_PATH}/${name}?${query.toString()}`;
}

/** Mannschaftsseite (Spielplan der Mannschaft + Verweis auf ihre Staffel). */
function teamPortraitUrl(teamId) {
  return buildUrl('teamPortrait', { teamtable: teamId });
}

/** Staffelseite (Tabelle + Gesamtspielplan). */
function groupPageUrl(championship, group) {
  return buildUrl('groupPage', { championship, group });
}

/** Spielbericht mit Spielverlauf. Alle drei Parameter sind Pflicht. */
function meetingReportUrl({ meeting, championship, group }) {
  return buildUrl('meetingReport', { meeting, championship, group });
}

/** Relative nuLiga-Links (aus href-Attributen) zu absoluten machen. */
function absoluteUrl(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
}

module.exports = {
  BASE_URL,
  APP_PATH,
  PAGES,
  TTL,
  STALE_TTL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  HALFTIME_MINUTES,
  LIVE_WINDOW_MINUTES,
  TEAM_ID_PATTERN,
  GAME_ID_PATTERN,
  isValidTeamId,
  isValidGameId,
  encodeGameId,
  decodeGameId,
  buildUrl,
  teamPortraitUrl,
  groupPageUrl,
  meetingReportUrl,
  absoluteUrl,
};
