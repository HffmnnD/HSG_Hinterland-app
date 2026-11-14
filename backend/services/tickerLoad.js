// Lastabhängiger Abfragetakt für den Live-Ticker.
//
// Das Backend sagt dem Handy bei jeder Antwort, wann es wieder fragen soll
// (`poll.afterMs` im DTO und Kopfzeile `X-Poll-Interval` in ms). Normalfall
// bei einem laufenden Spiel: 2 s. Wird es eng, streckt der Server den Takt –
// statt dass hunderte Handys einen ohnehin überlasteten Server weiter im
// 2-Sekunden-Takt beschießen. Gemessen werden drei Dinge:
//
//   1. Event-Loop-Verzögerung (p99 der letzten ~10 s): der direkteste Hinweis,
//      dass Node mit dem Abarbeiten nicht mehr hinterherkommt.
//   2. Gleichzeitig laufende Ticker-Anfragen.
//   3. Fehler/Timeouts bei nuScoreLive in der letzten Minute: dann bringt
//      häufigeres Fragen ohnehin nichts.
const { monitorEventLoopDelay } = require('node:perf_hooks');

const LIVE_MS = 2000;
const PRE_GAME_MS = 10_000;
const IDLE_MS = 60_000;
const MAX_MS = 30_000;

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();
let lagMs = 0;
const sampler = setInterval(() => {
  lagMs = histogram.percentile(99) / 1e6;
  histogram.reset();
}, 10_000);
sampler.unref?.();

let active = 0;
const upstreamErrors = [];

function requestStarted() {
  active += 1;
}
function requestFinished() {
  active = Math.max(0, active - 1);
}

function recordUpstreamError() {
  const now = Date.now();
  upstreamErrors.push(now);
  while (upstreamErrors.length && now - upstreamErrors[0] > 60_000) upstreamErrors.shift();
  if (upstreamErrors.length > 100) upstreamErrors.splice(0, upstreamErrors.length - 100);
}

function recentUpstreamErrors(now = Date.now()) {
  return upstreamErrors.filter((t) => now - t <= 60_000).length;
}

/** Faktor, um den der Takt gerade gestreckt wird (1 = normal), samt Grund. */
function loadFactor() {
  let factor = 1;
  const reasons = [];
  if (lagMs > 250) {
    factor *= 4;
    reasons.push('server');
  } else if (lagMs > 100) {
    factor *= 2;
    reasons.push('server');
  }
  if (active > 100) {
    factor *= 3;
    reasons.push('requests');
  } else if (active > 40) {
    factor *= 2;
    reasons.push('requests');
  }
  const errors = recentUpstreamErrors();
  if (errors >= 5) {
    factor *= 4;
    reasons.push('upstream');
  } else if (errors >= 2) {
    factor *= 2;
    reasons.push('upstream');
  }
  return { factor, reasons };
}

/**
 * Empfohlene Wartezeit bis zur nächsten Abfrage.
 * @param {{ state:string, game?:{startsAt?:string} }} ticker
 * @returns {{ afterMs:number|null, reason:string|null }} null = nicht mehr fragen
 */
function pollAdvice(ticker) {
  const state = ticker?.state;
  if (state === 'finished' || state === 'cancelled') return { afterMs: null, reason: null };

  let base = IDLE_MS;
  if (state === 'live') base = LIVE_MS;
  else {
    const start = ticker?.game?.startsAt ? new Date(ticker.game.startsAt).getTime() : NaN;
    if (Number.isFinite(start) && start - Date.now() <= 10 * 60_000) base = PRE_GAME_MS;
  }

  const { factor, reasons } = loadFactor();
  return {
    afterMs: Math.min(base * factor, Math.max(MAX_MS, base)),
    reason: reasons.length ? reasons.join(',') : null,
  };
}

function status() {
  return { lagMs: Math.round(lagMs), active, upstreamErrors: recentUpstreamErrors() };
}

module.exports = {
  requestStarted,
  requestFinished,
  recordUpstreamError,
  pollAdvice,
  status,
};
