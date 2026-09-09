// Handball-Controller (/api/handball/*) – Daten aus dem nuLiga-Portal des HHV.
//
// Kein HTTP-Zugriff und kein Caching in dieser Datei: das liegt in
// services/handballService.js. Hier passiert nur
//   1. Eingabeprüfung der IDs,
//   2. Aufruf des Service,
//   3. passende Cache-Header für den Browser.
//
//   GET /api/handball/table/:teamId      Tabelle der Liga
//   GET /api/handball/schedule/:teamId   Spielplan der Mannschaft
//   GET /api/handball/ticker/:gameId     Live-Ticker eines Spiels
//
// Alle drei antworten IMMER mit HTTP 200 und einem gültigen DTO – auch wenn
// der Verband nicht erreichbar ist (dann `meta.available === false`). Das ist
// Absicht: die PWA soll im Hallen-WLAN nichts kaputtgehen sehen, sondern einen
// Hinweis anzeigen können. Das gilt ausdrücklich auch dann, wenn nuLiga seine
// Seitenstruktur ändert und ein Selektor ins Leere greift.
const handballService = require('../services/handballService');
const { isValidTeamId, isValidGameId, TTL } = require('../config/handball');

// Mannschafts-ID = nuLigas `teamtable` (rein numerisch).
const INVALID_TEAM_ID =
  'Ungültige Mannschafts-ID. Erwartet wird die nuLiga-Nummer der Mannschaft.';

// Spiel-ID = zusammengesetzt (meeting.group.championship); sie stammt immer
// aus dem Spielplan und wird vom Client unverändert zurückgereicht.
const INVALID_GAME_ID =
  'Ungültige Spiel-ID. Erwartet wird die ID aus dem Spielplan.';

/**
 * Setzt den Browser-Cache passend zur Server-TTL.
 * `stale-while-revalidate` lässt das Handy die alte Antwort sofort zeigen und
 * im Hintergrund erneuern – merklich flüssiger beim Blättern in der App.
 */
function setCacheHeaders(res, seconds) {
  res.set(
    'Cache-Control',
    `private, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`
  );
}

// GET /api/handball/table/:teamId
async function getTable(req, res, next) {
  try {
    const { teamId } = req.params;
    if (!isValidTeamId(teamId)) {
      return res.status(400).json({ message: INVALID_TEAM_ID });
    }

    const table = await handballService.getTable(teamId);
    setCacheHeaders(res, TTL.table);
    return res.json(table);
  } catch (err) {
    return next(err);
  }
}

// GET /api/handball/schedule/:teamId
async function getSchedule(req, res, next) {
  try {
    const { teamId } = req.params;
    if (!isValidTeamId(teamId)) {
      return res.status(400).json({ message: INVALID_TEAM_ID });
    }

    const schedule = await handballService.getSchedule(teamId);
    setCacheHeaders(res, TTL.schedule);
    return res.json(schedule);
  } catch (err) {
    return next(err);
  }
}

// GET /api/handball/ticker/:gameId
async function getTicker(req, res, next) {
  try {
    const { gameId } = req.params;
    if (!isValidGameId(gameId)) {
      return res.status(400).json({ message: INVALID_GAME_ID });
    }

    const ticker = await handballService.getTicker(gameId);

    // Ein laufendes Spiel darf der Browser nur ganz kurz cachen, sonst
    // „klebt" der Spielstand. Alles andere darf länger liegen bleiben.
    setCacheHeaders(
      res,
      ticker.state === 'live' ? TTL.tickerLive : TTL.tickerIdle
    );
    return res.json(ticker);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getTable, getSchedule, getTicker };
