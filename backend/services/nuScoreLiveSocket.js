// Push-Kanal von nuScoreLive (WebSocket) für laufende Spiele.
//
// Warum zusätzlich zum REST-Abruf? Die REST-Antworten liegen hinter einem CDN:
// der Spielkopf bis zu 15 s, der unversionierte Spielverlauf bis zu einer
// Stunde. Erst die VERSION eines Spiels macht den Abruf frisch – und die
// kommt am schnellsten per Push. Ablauf:
//
//   1. Der Ticker-Service meldet ein laufendes Spiel an (watch()).
//   2. Diese Verbindung schickt `{"meetingUuids":[…]}` an nuScoreLive.
//   3. Jede neue Aktion kommt als Nachricht mit `meetingVersionNumber`.
//      -> neueste Version merken, Zeitpunkt merken (genaue Spieluhr!) und den
//         Ticker-Cache des Spiels verwerfen. Der nächste Abruf eines Handys
//         holt dann den Spielverlauf dieser Version – frisch.
//
// EINE Verbindung für den ganzen Server, egal wie viele Handys zuschauen.
// Spiele, die zwei Minuten niemand angefragt hat, werden wieder abgemeldet;
// ohne Spiele wird die Verbindung geschlossen. Fällt der Push aus, arbeitet
// der Service einfach im 2-Sekunden-REST-Takt weiter (isWatching() = false).
const { NUSCORE_SOCKET_ENABLED, NUSCORE_SOCKET_URL } = require('../config/handball');

const IDLE_UNSUBSCRIBE_MS = 2 * 60_000;
const HEARTBEAT_MS = 30_000;
const MAX_RECONNECT_MS = 60_000;

const subscriptions = new Map(); // meetingUuid -> { meetingId, lastWanted }
const latest = new Map(); // meetingId -> { version, idx, at }
const listeners = new Set();

let socket = null;
let connected = false;
let reconnectDelay = 2000;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastSent = '';

const available = () => NUSCORE_SOCKET_ENABLED && typeof globalThis.WebSocket === 'function';

function send(payload) {
  if (!connected || !socket) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    console.warn(`[nuScoreLive-Push] Senden fehlgeschlagen: ${err.message}`);
  }
}

/** Aktuelle Anmeldeliste schicken – nur wenn sie sich geändert hat. */
function syncSubscriptions(force = false) {
  const uuids = [...subscriptions.keys()].sort();
  const key = uuids.join(',');
  if (!force && key === lastSent) return;
  lastSent = key;
  send({ meetingUuids: uuids });
}

function prune() {
  const now = Date.now();
  for (const [uuid, sub] of subscriptions) {
    if (now - sub.lastWanted > IDLE_UNSUBSCRIBE_MS) subscriptions.delete(uuid);
  }
  if (subscriptions.size === 0) {
    close();
    return;
  }
  syncSubscriptions();
}

function close() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  lastSent = '';
  if (socket) {
    const s = socket;
    socket = null;
    connected = false;
    try {
      s.close();
    } catch {
      // ohnehin schon zu
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || subscriptions.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectTimer.unref?.();
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
}

function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return;
  }
  const meetingId = msg?.meetingID ? String(msg.meetingID) : null;
  if (!meetingId) return;

  const at = Date.now();
  const idx = Number.isFinite(msg.event?.idx) ? msg.event.idx : null;
  latest.set(meetingId, {
    version: typeof msg.meetingVersionNumber === 'string' ? msg.meetingVersionNumber : null,
    idx,
    at,
  });
  if (latest.size > 200) latest.delete(latest.keys().next().value);

  // Die gemeldete(n) Aktion(en) samt Empfangszeit – Grundlage der echten
  // Uhrzeiten im Ticker (services/tickerEventTimes.js). Typ 0 bringt eine
  // Aktion in `event`, Typ 1 (nachdokumentiert) ggf. mehrere in `events`.
  const pushed = Array.isArray(msg.events) ? msg.events : msg.event ? [msg.event] : [];
  const info = {
    at: new Date(at),
    events: pushed
      .filter((e) => Number.isInteger(e?.idx))
      .map((e) => ({ idx: e.idx, code: Number.isInteger(e.event) ? e.event : null })),
    documented: msg.type === 1,
  };

  for (const fn of listeners) {
    try {
      fn(meetingId, info);
    } catch (err) {
      console.warn(`[nuScoreLive-Push] Listener-Fehler: ${err.message}`);
    }
  }
}

function connect() {
  if (!available() || socket || subscriptions.size === 0) return;
  let s;
  try {
    // Node 22+: eingebauter WebSocket (undici). Origin wie der Web-Ticker.
    s = new globalThis.WebSocket(NUSCORE_SOCKET_URL, {
      headers: { Origin: 'https://hbde-live.liga.nu' },
    });
  } catch (err) {
    console.warn(`[nuScoreLive-Push] Verbindung nicht möglich: ${err.message}`);
    scheduleReconnect();
    return;
  }
  socket = s;

  s.addEventListener('open', () => {
    if (socket !== s) return;
    connected = true;
    reconnectDelay = 2000;
    syncSubscriptions(true);
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      send({ heartbeat: new Date() });
      prune();
    }, HEARTBEAT_MS);
    heartbeatTimer.unref?.();
  });
  s.addEventListener('message', (event) => handleMessage(event.data));
  s.addEventListener('error', () => {
    // Details kommen mit 'close'; hier nichts doppelt loggen.
  });
  s.addEventListener('close', () => {
    if (socket !== s) return;
    socket = null;
    connected = false;
    lastSent = '';
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    scheduleReconnect();
  });
}

/**
 * Laufendes Spiel anmelden (bzw. die Anmeldung auffrischen).
 * @param {string} meetingId nuLiga-/nuScoreLive-Spielnummer
 * @param {string} meetingUuid UUID aus meeting/<id>/time/<t>
 */
function watch(meetingId, meetingUuid) {
  if (!available() || !meetingUuid) return;
  const isNew = !subscriptions.has(meetingUuid);
  subscriptions.set(meetingUuid, { meetingId: String(meetingId), lastWanted: Date.now() });
  if (!socket) connect();
  else if (isNew) syncSubscriptions();
}

/** true, wenn Pushes für dieses Spiel gerade ankommen können. */
function isWatching(meetingId) {
  if (!connected) return false;
  for (const sub of subscriptions.values()) if (sub.meetingId === String(meetingId)) return true;
  return false;
}

/** Neueste per Push gemeldete Version/Aktion eines Spiels (oder null). */
function latestPush(meetingId) {
  return latest.get(String(meetingId)) ?? null;
}

/**
 * Rückruf bei jeder neuen Aktion: fn(meetingId, { at, events:[{idx, code}], documented }).
 * `documented` = nachträglich dokumentierte Aktionen (Typ 1) – deren
 * Empfangszeit ist NICHT der Zeitpunkt der Aktion.
 */
function onUpdate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function status() {
  return { enabled: available(), connected, subscriptions: subscriptions.size };
}

module.exports = { watch, isWatching, latestPush, onUpdate, status, close };
