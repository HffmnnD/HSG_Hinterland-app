// Übernimmt den nuLiga-Spielplan einer Mannschaft als Termine in den Kalender.
//
// Warum die Spiele als ECHTE Zeilen in `events` landen und nicht bloß
// eingeblendet werden: Nur so gilt für sie dasselbe wie für jedes Training –
// Spieler:innen können sich abmelden, das Trainerteam sieht den Kader, und die
// Beteiligung lässt sich getrennt nach Training und Spielen auswerten. Ein
// reines Overlay hätte nichts davon.
//
// Der Abgleich ist idempotent: `events.nuliga_game_id` ist je Mannschaft
// eindeutig, ein erneuter Lauf aktualisiert denselben Termin. Verlegt der
// Verband ein Spiel, ändert sich nur die Uhrzeit – abgegebene Rückmeldungen
// bleiben erhalten.
const handballService = require('./handballService');
const eventRepository = require('../repositories/eventRepository');
const teamRepository = require('../repositories/teamRepository');
const { utcIsoToLocalSql, addMinutesToSql, nowSqlDateTime } =
  require('../utils/schedule');

// nuLiga nennt nur den Anwurf. Ein Handballspiel dauert mit Hallenzeit,
// Aufwärmen und Abschluss realistisch rund zwei Stunden – damit steht im
// Kalender ein brauchbarer Zeitraum statt eines Zeitpunkts.
const MATCH_DURATION_MINUTES = 120;

// Wie lange ein Abgleich als frisch gilt. handballService cacht die
// Verbandsseite ohnehin 15 Minuten; diese Grenze verhindert nur, dass jeder
// Seitenaufruf einen Abgleich anstößt.
const FRESH_FOR_MINUTES = 360; // 6 Stunden

// Nach einem fehlgeschlagenen Versuch so lange nicht erneut fragen. Ohne diese
// Sperre würde ein Ausfall des Verbands bei JEDEM Seitenaufruf einen neuen
// Abruf auslösen – der Zeitstempel in der Datenbank wird ja nur nach Erfolg
// gesetzt.
const RETRY_AFTER_MINUTES = 10;

// Läuft gerade ein Abgleich für diese Mannschaft? Verhindert, dass zwanzig
// gleichzeitige Seitenaufrufe zwanzig Abrufe beim Verband auslösen.
const inFlight = new Set();

// team_id -> Zeitpunkt des letzten erfolglosen Versuchs.
const lastFailure = new Map();

/**
 * Stabiler Schlüssel eines Spiels.
 *
 * NICHT die nuLiga-Spiel-ID: Die entsteht erst, wenn zu einer Begegnung ein
 * Spielbericht existiert – bei einem Spielplan vor der Saison ist sie für
 * praktisch jedes Spiel leer, und die Spiele fielen beim Abgleich durch. Sie
 * würde sich ausserdem nachträglich ändern (vor dem Spiel keine, danach eine),
 * wodurch dasselbe Spiel zweimal im Kalender stünde.
 *
 * Stattdessen die SPIELNUMMER, die nuLiga von Anfang an vergibt und die
 * innerhalb einer Staffel eindeutig ist. Die Saison kommt dazu, weil die
 * Nummern jede Saison von vorn beginnen – ohne sie würde der Abgleich das
 * gleichnummerige Spiel der Vorsaison überschreiben.
 *
 * @param {object} game
 * @param {string} startTimeSql Anwurf als `YYYY-MM-DD HH:MM:SS`
 * @returns {string|null} null, wenn keine Nummer vorliegt
 */
function stableKey(game, startTimeSql) {
  if (!game?.number) return null;
  const [year, month] = startTimeSql.split(' ')[0].split('-').map(Number);
  // Handball-Saison läuft Juli bis Juni; sie bekommt das Jahr ihres Beginns.
  const season = month >= 7 ? year : year - 1;
  return `nr:${String(game.number).trim()}@${season}`.slice(0, 64);
}

/** Titel eines Spiels: klassische Paarungsschreibweise. */
function titleFor(game) {
  const home = game.home?.name ?? 'Heim';
  const away = game.away?.name ?? 'Gast';
  return `${home} – ${away}`.slice(0, 120);
}

/**
 * Ein nuLiga-Spiel -> Zeile für `events`.
 * @returns {object|null} null, wenn Pflichtangaben fehlen
 */
function toEventRow(game) {
  if (!game?.startsAt) return null;

  const startTime = utcIsoToLocalSql(game.startsAt);
  if (!startTime) return null;

  const key = stableKey(game, startTime);
  if (!key) return null;

  return {
    nuligaGameId: key,
    title: titleFor(game),
    location: game.venue?.name ? String(game.venue.name).slice(0, 120) : null,
    startTime,
    endTime: addMinutesToSql(startTime, MATCH_DURATION_MINUTES),
  };
}

/**
 * Spielplan einer Mannschaft holen und übernehmen.
 *
 * Wirft NICHT, wenn der Verband nicht erreichbar ist – ein nuLiga-Ausfall darf
 * den Kalender nie kaputt machen. Das Ergebnis sagt, was passiert ist.
 *
 * @param {{id:number, handballTeamId:string|null}} team
 * @returns {Promise<{ok:boolean, reason?:string, imported?:number}>}
 */
async function syncTeam(team) {
  if (!team.handballTeamId) {
    return { ok: false, reason: 'no-team-id' };
  }

  let schedule;
  try {
    schedule = await handballService.getSchedule(team.handballTeamId);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  // Der Service antwortet auch bei einer Störung mit einem gültigen DTO –
  // dann aber mit leerer Spielliste. Die dürfen wir nicht als „Saison vorbei"
  // missverstehen und die bereits übernommenen Spiele löschen.
  const games = Array.isArray(schedule?.games) ? schedule.games : [];
  if (schedule?.meta?.available === false) {
    return { ok: false, reason: 'unavailable' };
  }

  const rows = games.map(toEventRow).filter(Boolean);
  const imported = await eventRepository.upsertNuligaEvents(team.id, rows);

  // Spiele, die nuLiga nicht mehr führt (abgesagt, zurückgezogen), aus dem
  // Kalender nehmen – aber nur künftige. Vergangene sind Historie.
  const removed = await eventRepository.deleteStaleNuligaEvents(
    team.id,
    rows.map((row) => row.nuligaGameId),
    nowSqlDateTime()
  );

  await teamRepository.markNuligaSynced(team.id, nowSqlDateTime());
  return { ok: true, imported, removed };
}

/**
 * Stößt den fälligen Abgleich an – und WARTET NICHT darauf.
 *
 * Der Abruf beim Verband darf bis zu zehn Sekunden dauern. Würde die
 * Terminliste darauf warten, hinge alle sechs Stunden genau eine Person
 * unverschuldet zehn Sekunden am Ladebalken, und bei einer Störung des
 * Verbands jede erneut. Die Liste antwortet deshalb sofort mit dem aktuellen
 * Stand; das Ergebnis des Abgleichs sieht man beim nächsten Aufruf.
 *
 * Ein ausdrückliches „Einschalten" oder „Aktualisieren" im Planungsbereich
 * wartet dagegen sehr wohl (siehe syncTeam) – dort erwartet man Rückmeldung.
 *
 * @param {object[]} teams Zeilen aus teamRepository (mit nuligaSyncEnabled)
 */
function syncStaleTeams(teams) {
  const due = teams.filter(
    (team) =>
      team.nuligaSyncEnabled &&
      team.handballTeamId &&
      !inFlight.has(team.id) &&
      isStale(team.nuligaSyncedAt) &&
      !recentlyFailed(team.id)
  );
  if (due.length === 0) return;

  for (const team of due) inFlight.add(team.id);

  // Bewusst ohne await – und nacheinander statt parallel: mehrere
  // Mannschaften desselben Vereins hängen oft an derselben Verbandsseite,
  // deren Cache erst nach dem ersten Abruf greift.
  (async () => {
    for (const team of due) {
      try {
        const result = await syncTeam(team);
        if (result.ok) lastFailure.delete(team.id);
        else lastFailure.set(team.id, Date.now());
      } catch {
        lastFailure.set(team.id, Date.now());
      } finally {
        inFlight.delete(team.id);
      }
    }
  })();
}

/** Liegt ein erfolgloser Versuch weniger als RETRY_AFTER_MINUTES zurück? */
function recentlyFailed(teamId, now = Date.now()) {
  const failedAt = lastFailure.get(teamId);
  return Boolean(failedAt) && now - failedAt < RETRY_AFTER_MINUTES * 60000;
}

/** Ist der letzte Abgleich älter als FRESH_FOR_MINUTES (oder nie gelaufen)? */
function isStale(syncedAt, now = new Date()) {
  if (!syncedAt) return true;
  const last = new Date(String(syncedAt).replace(' ', 'T'));
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() > FRESH_FOR_MINUTES * 60000;
}

module.exports = {
  MATCH_DURATION_MINUTES,
  FRESH_FOR_MINUTES,
  RETRY_AFTER_MINUTES,
  stableKey,
  toEventRow,
  syncTeam,
  syncStaleTeams,
  isStale,
};
