// Wächter für laufende Spiele aller Mannschaften mit nuLiga-Code.
//
// Wozu? Die echten Uhrzeiten im Ticker („Anpfiff 18:02 Uhr", siehe
// services/tickerEventTimes.js) kennt nur, wer das Spiel LIVE verfolgt hat.
// Schaut gerade niemand in der App zu, würde sonst niemand mitschreiben.
// Der Wächter sorgt dafür, dass das Backend während der Spielzeit jeder
// eigenen Mannschaft beim nuScoreLive-Push angemeldet bleibt.
//
// Last bewusst niedrig:
//   * Spielpläne alle 30 Minuten (sie kommen ohnehin aus dem 15-Minuten-
//     Cache des Handball-Service, also kaum Zusatzabrufe bei nuLiga).
//   * Nur Spiele im Zeitfenster „15 Min vor bis 3 h nach Anwurf" werden
//     einmal pro Minute über den normalen Ticker-Weg abgerufen. Der ist
//     gecacht und meldet das Spiel beim Push an – die eigentliche Arbeit
//     macht danach der Push.
//   * Ein beendetes Spiel fällt aus der Liste.
//
// Abschalten: HANDBALL_LIVE_WATCH=false
const teamRepository = require('../repositories/teamRepository');

const ENABLED = process.env.HANDBALL_LIVE_WATCH !== 'false';
const TICK_MS = 60_000;
const SCHEDULE_REFRESH_MS = 30 * 60_000;
const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 3 * 3600_000;
const LOOKAHEAD_MS = 24 * 3600_000;

const candidates = new Map(); // gameId -> { startsAt:number, teamId }
let lastScheduleRefresh = 0;
let running = false;
let timer = null;

async function refreshSchedules(handball) {
  const teams = (await teamRepository.listAll()).filter((t) => t.handballTeamId);
  const now = Date.now();
  for (const team of teams) {
    try {
      const schedule = await handball.getSchedule(team.handballTeamId);
      for (const game of schedule.games ?? []) {
        if (!game.id || !game.startsAt || game.state === 'finished') continue;
        const start = new Date(game.startsAt).getTime();
        if (Number.isNaN(start)) continue;
        if (start + AFTER_MS < now || start - now > LOOKAHEAD_MS) continue;
        candidates.set(game.id, { startsAt: start, teamId: team.handballTeamId });
      }
    } catch (err) {
      console.warn(`[live-wächter] Spielplan ${team.handballTeamId}: ${err.message}`);
    }
  }
  lastScheduleRefresh = now;
}

async function tick() {
  if (running) return;
  running = true;
  // Erst beim ersten Lauf laden – vermeidet einen Kreis-Import mit dem
  // Handball-Service, der diesen Wächter nicht kennt.
  const handball = require('./handballService');
  try {
    const now = Date.now();
    if (now - lastScheduleRefresh > SCHEDULE_REFRESH_MS) await refreshSchedules(handball);

    for (const [gameId, game] of candidates) {
      if (now > game.startsAt + AFTER_MS) {
        candidates.delete(gameId);
        continue;
      }
      if (now < game.startsAt - BEFORE_MS) continue;

      try {
        const ticker = await handball.getTicker(gameId);
        if (ticker.state === 'finished' && now > game.startsAt + 30 * 60_000) {
          candidates.delete(gameId);
        }
      } catch (err) {
        console.warn(`[live-wächter] Ticker ${gameId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[live-wächter] ${err.message}`);
  } finally {
    running = false;
  }
}

/** Startet den Wächter (einmalig; weitere Aufrufe sind wirkungslos). */
function start() {
  if (!ENABLED || timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  // Erster Lauf kurz nach dem Start, damit der Server erst hochfährt.
  setTimeout(tick, 30_000).unref?.();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

function status() {
  return { enabled: ENABLED, active: Boolean(timer), games: candidates.size };
}

module.exports = { start, stop, status, tick };
