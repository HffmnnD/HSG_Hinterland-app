// Echte Uhrzeiten der Ticker-Aktionen („Anpfiff 18:02 Uhr").
//
// nuScoreLive liefert zu jeder Aktion nur die SPIELSEKUNDE, keine Uhrzeit.
// Die Uhrzeit kennt also nur, wer die Aktion live empfangen hat – deshalb
// merkt sich das Backend selbst, WANN es eine Aktion zum ersten Mal gesehen
// hat, und speichert das dauerhaft (Tabelle ticker_event_times, Migration 022),
// damit es einen Neustart übersteht.
//
// Grundsatz: Es wird NIE eine Uhrzeit erfunden.
//   * push  – die Aktion kam per WebSocket: Zeitpunkt sekundengenau.
//   * rest  – die Aktion tauchte bei einem Abruf WÄHREND des Spiels neu auf
//             (Push gerade nicht verbunden): höchstens einen Abfragetakt spät.
//   * Aktionen, die schon da waren, als dieser Server das Spiel zum ersten
//     Mal abgerufen hat (z. B. Neustart mitten im Spiel), bekommen KEINE
//     Uhrzeit – ihr Zeitpunkt ist unbekannt.
const pool = require('../config/db');

const CACHE_MS = 10 * 60_000;
// Größter Abstand zwischen zwei Abrufen, bei dem neue Aktionen noch als „eben
// gesehen" gelten. Der Wächter (liveGameWatcher) fragt laufende Spiele jede
// Minute ab; die Zuschauer-Handys alle 2 s.
const MAX_GAP_MS = 3 * 60_000;
const MAX_MEETINGS = 300;

// meetingId -> { times: Map<idx, { at:Date, source }>, loadedAt, loading }
const cache = new Map();
// meetingId -> { idx, at }: höchste bekannte idx und Zeitpunkt des letzten
// Abrufs in DIESEM Prozess (Grundlinie für REST-Beobachtungen, siehe unten).
const restBaseline = new Map();

function trim(map) {
  while (map.size > MAX_MEETINGS) map.delete(map.keys().next().value);
}

async function loadFromDb(meetingId) {
  const [rows] = await pool.query(
    'SELECT event_idx, observed_at, source FROM ticker_event_times WHERE meeting_id = ?',
    [String(meetingId)]
  );
  const times = new Map();
  for (const row of rows) {
    times.set(Number(row.event_idx), { at: new Date(row.observed_at), source: row.source });
  }
  return times;
}

/**
 * Bekannte Uhrzeiten eines Spiels (aus dem Speicher, sonst aus der DB).
 * Fehler der Datenbank sind nie fatal – dann eben ohne Uhrzeiten.
 * @returns {Promise<Map<number, { at:Date, source:string }>>}
 */
async function timesFor(meetingId) {
  const key = String(meetingId);
  const entry = cache.get(key);
  if (entry && Date.now() - entry.loadedAt < CACHE_MS) return entry.times;
  try {
    const fromDb = await loadFromDb(key);
    // Was zwischenzeitlich nur im Speicher steht, nicht verlieren.
    if (entry) for (const [idx, value] of entry.times) if (!fromDb.has(idx)) fromDb.set(idx, value);
    cache.set(key, { times: fromDb, loadedAt: Date.now() });
    trim(cache);
    return fromDb;
  } catch (err) {
    console.warn(`[ticker-zeiten] Laden fehlgeschlagen (${key}): ${err.message}`);
    return entry?.times ?? new Map();
  }
}

/** Eine Beobachtung festhalten (erste gewinnt, spätere werden ignoriert). */
async function record(meetingId, idx, eventCode, at, source) {
  const key = String(meetingId);
  if (!Number.isInteger(idx) || idx < 0) return;
  const times = await timesFor(key);
  if (times.has(idx)) return;
  times.set(idx, { at, source });
  try {
    await pool.query(
      `INSERT IGNORE INTO ticker_event_times (meeting_id, event_idx, event_code, observed_at, source)
       VALUES (?, ?, ?, ?, ?)`,
      [key, idx, Number.isInteger(eventCode) ? eventCode : null, at, source]
    );
  } catch (err) {
    console.warn(`[ticker-zeiten] Speichern fehlgeschlagen (${key}/${idx}): ${err.message}`);
  }
}

/** Push-Nachricht empfangen -> Uhrzeit sekundengenau festhalten. */
function recordPush(meetingId, idx, eventCode, at = new Date()) {
  return record(meetingId, idx, eventCode, at, 'push');
}

/**
 * Rohereignisse eines REST-Abrufs während des Spiels prüfen. Beim ERSTEN
 * Abruf je Spiel und Prozess wird nur die Grundlinie gesetzt (deren Zeitpunkt
 * ist unbekannt). Danach neu auftauchende Aktionen bekommen „jetzt".
 *
 * @param {string} meetingId
 * @param {object[]} rawEvents nuScoreLive-Ereignisse ({ idx, event, … })
 * @param {boolean} live läuft das Spiel (oder steht der Anwurf unmittelbar bevor)?
 */
async function observeRest(meetingId, rawEvents, live) {
  const key = String(meetingId);
  const now = new Date();
  const maxIdx = rawEvents.reduce((max, e) => Math.max(max, Number.isInteger(e.idx) ? e.idx : -1), -1);
  const previous = restBaseline.get(key);

  // Grundlinie neu setzen (ohne etwas zu notieren), wenn es noch keine gibt
  // ODER der letzte Abruf zu lange her ist: Was dazwischen passiert ist, hat
  // niemand live gesehen – dessen Uhrzeit ist unbekannt. Ohne Ereignisse (vor
  // dem Anpfiff) ist die Grundlinie „nichts gesehen" – dann bekommt auch der
  // Anpfiff seine Uhrzeit.
  if (!previous || now - previous.at > MAX_GAP_MS) {
    restBaseline.set(key, { idx: maxIdx, at: now });
    trim(restBaseline);
    return;
  }
  restBaseline.set(key, { idx: Math.max(previous.idx, maxIdx), at: now });
  if (!live) return;

  for (const e of rawEvents) {
    if (Number.isInteger(e.idx) && e.idx > previous.idx) {
      await record(key, e.idx, e.event, now, 'rest');
    }
  }
}

module.exports = { timesFor, recordPush, observeRest };
