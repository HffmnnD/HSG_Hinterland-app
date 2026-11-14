// nuScoreLive-JSON -> dieselben DTOs, die das Frontend schon vom nuLiga-
// Ticker kennt (siehe mapTicker in handballMapper.js). Das Frontend merkt
// also nicht, aus welcher Quelle der Ticker stammt.
//
// Feldnamen von nuScoreLive (Stand 11/2026, aus dem offiziellen Web-Ticker):
//   meeting: meetingID, meetingUuid, teamHome, teamGuest (Namen!), scheduled
//            (UTC, "2026-11-07T17:00:00.000+0000"), matchesHome/matchesGuest
//            (aktueller Stand), halfTimeScoreHome/Guest, live (bool),
//            halftimeLength (Minuten), courtHallName, homeImgUrl/guestImgUrl
//   event:   event (Zahl, siehe EVENT_CODES), idx (laufende Nummer), second
//            (Spielsekunde), pointsHome/pointsGuest, personFirstname,
//            personLastname, meetingPersonId, teamHome (bool|null)
//   player:  meetingPersonId, nr (Trikotnummer), firstname, lastname
const { NUSCORE_BASE_URL } = require('../config/handball');

// Ereigniscodes von nuScoreLive (Enum aus dem Web-Ticker) -> Frontend-Typ.
// `null` = kein eigener Tickereintrag (nur Uhr-Steuerung).
const EVENT_CODES = {
  0: null, // GAME_TIME_START – Uhr läuft
  1: null, // GAME_TIME_STOP – Uhr steht
  2: 'timeout', // INTERRUPTION_BY_HOME – Team-Auszeit Heim
  3: 'timeout', // INTERRUPTION_BY_GUEST – Team-Auszeit Gast
  4: 'goal', // GOAL
  5: 'penaltyGoal', // SEVEN_METER_GOAL
  6: 'penaltyMissed', // SEVEN_METER_NO_GOAL
  7: 'ownGoal', // OWN_GOAL – zählt nicht als Torschütze
  8: 'suspension', // PLAYER_PENALTY – 2 Minuten
  9: 'yellowCard', // PLAYER_WARNING – Verwarnung
  10: 'blueCard', // DISQUALIFICATION_REPORT – Disqualifikation mit Bericht
  11: 'redCard', // DISQUALIFICATION_NO_REPORT – Disqualifikation
  12: 'suspension', // TEAM_PENALTY_HOME
  13: 'suspension', // TEAM_PENALTY_GUEST
  14: 'periodEnd', // GAME_PERIOD_STOP – Halbzeit
  15: 'periodStart', // GAME_PERIOD_START – Anwurf (je Halbzeit)
  16: 'final', // GAME_END
  17: null, // GAME_START – doppelt zum ersten GAME_PERIOD_START
  18: 'other', // PLAYER_TO_OFFICIAL_SWITCH
  19: 'other', // OFFICIAL_TO_PLAYER_SWITCH
};

const EVENT_TEXT = {
  7: 'Eigentor',
  12: 'Teamstrafe',
  13: 'Teamstrafe',
  18: 'Wechsel Spieler → Offizieller',
  19: 'Wechsel Offizieller → Spieler',
};

const TIMER_START = 0;
const TIMER_STOP = 1;
const GAME_END = 16;

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text || null;
};

const toInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** "2026-11-07T17:00:00.000+0000" -> ISO-String (UTC) oder null. */
function parseScheduled(value) {
  if (!value) return null;
  // "+0000" ist für Date.parse nicht überall gültig -> in "+00:00" wandeln.
  const normalized = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Sekunden -> "MM:SS". */
function formatClock(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Mannschaftsnamen für den Abgleich mit nuLiga vergleichbar machen. */
function normalizeTeamName(name) {
  return (clean(name) ?? '').toLowerCase().replace(/[\s.\-/]+/g, '');
}

function logoUrl(uuid) {
  return /^[0-9a-f-]{36}$/i.test(uuid ?? '') ? `${NUSCORE_BASE_URL}/images/${uuid}` : null;
}

/** Neuestes Ereignis zuerst – Spielsekunde, bei Gleichstand die laufende Nummer. */
const byNewest = (a, b) => (b.second ?? 0) - (a.second ?? 0) || (b.idx ?? 0) - (a.idx ?? 0);

/**
 * Zustand der Uhr aus dem Spielverlauf. nuScoreLive liefert keine Uhrzeit,
 * nur Spielsekunden – ob die Uhr läuft, zeigt das jüngste Start/Stopp-Ereignis.
 */
function clockState(rawEvents) {
  const sorted = [...rawEvents].sort(byNewest);
  const latest = sorted[0] ?? null;
  const timer = [...rawEvents]
    .filter((e) => e.event === TIMER_START || e.event === TIMER_STOP)
    .sort((a, b) => (b.idx ?? 0) - (a.idx ?? 0))[0];
  return {
    latestIdx: rawEvents.reduce((max, e) => Math.max(max, toInt(e.idx) ?? -1), -1),
    baseSeconds: latest ? toInt(latest.second) : null,
    running: timer ? timer.event === TIMER_START : false,
  };
}

/**
 * Ein Spiel aus der Staffelliste -> kompakte Form für den Abgleich mit dem
 * nuLiga-Spielplan.
 */
function mapMeetingSummary(meeting) {
  return {
    meetingId: clean(meeting.meetingID),
    groupId: clean(meeting.groupID),
    startsAt: parseScheduled(meeting.scheduled),
    home: clean(meeting.teamHome),
    away: clean(meeting.teamGuest),
    live: meeting.live === true,
    enabled: meeting.nuScoreLiveEnabled !== false,
    homeGoals: toInt(meeting.matchesHome),
    awayGoals: toInt(meeting.matchesGuest),
  };
}

/**
 * nuScoreLive-Spiel + Ereignisse (+ Spieler) -> Ticker-DTO.
 *
 * @param {object} meeting  Antwort von meeting/<id>/time/<t>
 * @param {object[]} rawEvents `events` aus events/<id>
 * @param {object[]} players `meetingPersons` aus players/<id>/… (darf leer sein)
 * @param {string} gameId   zusammengesetzte App-ID (config/handball.js)
 * @param {object} [extra]  Felder aus dem nuLiga-Spielplan (number, competition)
 */
function mapNuScoreTicker(meeting, rawEvents, players, gameId, extra = {}) {
  const halftimeMinutes = toInt(meeting.halftimeLength) || 30;
  const halfSeconds = halftimeMinutes * 60;

  const numbers = new Map(
    (players ?? []).map((p) => [p.meetingPersonId, clean(p.nr)])
  );

  const events = [];
  for (const raw of rawEvents) {
    const type = EVENT_CODES[raw.event];
    if (!type) continue;

    const seconds = toInt(raw.second);
    // „Spielabschnitt beendet" zum Spielende doppelt die Schlusssirene.
    if (raw.event === 14 && seconds !== null && seconds >= 2 * halfSeconds) continue;
    let side = raw.teamHome === true ? 'home' : raw.teamHome === false ? 'away' : null;
    if (raw.event === 2 || raw.event === 12) side = 'home';
    if (raw.event === 3 || raw.event === 13) side = 'away';

    const name = [clean(raw.personLastname), clean(raw.personFirstname)]
      .filter(Boolean)
      .join(', ');

    events.push({
      id: `ns-${raw.idx ?? events.length}`,
      idx: toInt(raw.idx) ?? 0,
      type,
      clockSeconds: seconds,
      clock: formatClock(seconds),
      // nuScoreLive zählt durchgehend; der Anwurf zur 2. Halbzeit liegt
      // genau auf der Halbzeitgrenze.
      period:
        seconds === null
          ? null
          : seconds > halfSeconds || (raw.event === 15 && seconds >= halfSeconds)
            ? 2
            : 1,
      side,
      teamName: null,
      player: name || null,
      playerNumber: numbers.get(raw.meetingPersonId) ?? null,
      personId: clean(raw.meetingPersonId),
      scoreHome: toInt(raw.pointsHome),
      scoreAway: toInt(raw.pointsGuest),
      text: EVENT_TEXT[raw.event] ?? null,
    });
  }

  events.sort(
    (a, b) => (b.clockSeconds ?? 0) - (a.clockSeconds ?? 0) || b.idx - a.idx
  );
  events.forEach((event) => delete event.idx);

  const latestWithScore = events.find((e) => e.scoreHome !== null && e.scoreAway !== null);
  const clock = clockState(rawEvents);
  const startsAt = parseScheduled(meeting.scheduled);

  const hasEnd = rawEvents.some((e) => e.event === GAME_END);
  const started = rawEvents.length > 0;
  let state;
  if (meeting.live === true && !hasEnd) state = 'live';
  else if (hasEnd || started) state = 'finished';
  else state = 'upcoming';

  // Stand: bevorzugt aus dem jüngsten Ereignis. Der Spielverlauf wird
  // versioniert (also frisch) abgerufen, der Spielkopf `meeting/…/time/…`
  // kann dagegen bis zu 15 s alt sein. Vor Anwurf steht dort 0:0.
  const homeGoals = started
    ? (latestWithScore?.scoreHome ?? toInt(meeting.matchesHome) ?? null)
    : null;
  const awayGoals = started
    ? (latestWithScore?.scoreAway ?? toInt(meeting.matchesGuest) ?? null)
    : null;

  // Halbzeitstand erst zeigen, wenn die erste Halbzeit vorbei ist.
  const pastHalf = (clock.baseSeconds ?? 0) >= halfSeconds || state === 'finished';

  const home = { id: null, name: clean(meeting.teamHome), logoUrl: logoUrl(meeting.homeImgUrl) };
  const away = { id: null, name: clean(meeting.teamGuest), logoUrl: logoUrl(meeting.guestImgUrl) };

  const baseSeconds = clock.baseSeconds;
  return {
    gameId,
    game: {
      id: gameId,
      number: extra.number ?? null,
      startsAt,
      state,
      home,
      away,
      homeGoals,
      awayGoals,
      homeGoalsHalftime: pastHalf ? toInt(meeting.halfTimeScoreHome) : null,
      awayGoalsHalftime: pastHalf ? toInt(meeting.halfTimeScoreGuest) : null,
      competition: extra.competition ?? null,
      venue: clean(meeting.courtHallName) ? { name: clean(meeting.courtHallName), city: null } : null,
      isHome: null,
      opponent: null,
    },
    state,
    homeGoals,
    awayGoals,
    clock: formatClock(baseSeconds),
    clockSeconds: baseSeconds,
    period: baseSeconds === null ? null : baseSeconds > halfSeconds ? 2 : 1,
    // Reguläre Spieldauer – Jugend spielt kürzer (2 x 25, 2 x 20 …).
    durationMinutes: halftimeMinutes * 2,
    events,
    // Zusatzinfos für die mitlaufende Uhr (siehe handballService).
    live: {
      provider: 'nuScoreLive',
      meetingId: clean(meeting.meetingID),
      clockRunning: state === 'live' && clock.running,
      latestIdx: clock.latestIdx,
      halftimeMinutes,
    },
  };
}

// ------------------------------------------------------------ Spielkader --

// personType aus nuScoreLive (Enum des Web-Tickers).
const PERSON_TYPE = {
  PLAYER: 0,
  GOALKEEPER: 1,
  OFFICIAL: 2,
  REFEREE: 3,
  REFEREE_OBSERVER: 4,
  TIMEKEEPER: 5,
  SECRETARY: 6,
  SUPERVISOR: 7,
  TECHNICAL_DELEGATE: 8,
};

function personName(p) {
  return [clean(p.lastname), clean(p.firstname)].filter(Boolean).join(', ') || null;
}

/** Statistik je Person (meetingPersonId) aus den Rohereignissen. */
function statsByPerson(rawEvents) {
  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) {
      stats.set(id, { goals: 0, penaltyGoals: 0, penaltyMissed: 0, suspensions: 0, yellow: 0, red: 0, blue: 0 });
    }
    return stats.get(id);
  };
  for (const e of rawEvents) {
    if (!e.meetingPersonId) continue;
    const s = get(e.meetingPersonId);
    if (e.event === 4 || e.event === 5) s.goals += 1;
    if (e.event === 5) s.penaltyGoals += 1;
    if (e.event === 6) s.penaltyMissed += 1;
    if (e.event === 8) s.suspensions += 1;
    if (e.event === 9) s.yellow += 1;
    if (e.event === 10) s.blue += 1;
    if (e.event === 11) s.red += 1;
  }
  return stats;
}

const byNumber = (a, b) => {
  const na = Number.parseInt(a.number, 10);
  const nb = Number.parseInt(b.number, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return String(a.number ?? '').localeCompare(String(b.number ?? ''), 'de') ||
    String(a.name).localeCompare(String(b.name), 'de');
};

/**
 * Spielkader beider Mannschaften (Spieler + Offizielle) und das Schiedsgericht.
 * Gibt null zurück, wenn nuScoreLive für das Spiel keine Personen führt – das
 * Frontend blendet den Abschnitt dann aus.
 *
 * @param {object[]} players    meetingPersons aus players/…
 * @param {object[]} officials  meetingPersons aus officials/…
 * @param {object[]} fedOfficials meetingPersons aus fedOfficials/…
 * @param {object[]} rawEvents  Rohereignisse (für Tore/Strafen je Person)
 */
function mapLineup(players, officials, fedOfficials, rawEvents) {
  if (!(players?.length || officials?.length)) return null;
  const stats = statsByPerson(rawEvents ?? []);
  const empty = { goals: 0, penaltyGoals: 0, penaltyMissed: 0, suspensions: 0, yellow: 0, red: 0, blue: 0 };

  const team = () => ({ players: [], officials: [] });
  const lineup = { home: team(), away: team() };

  for (const p of players ?? []) {
    const side = p.teamHome === true ? 'home' : p.teamHome === false ? 'away' : null;
    if (!side) continue;
    lineup[side].players.push({
      id: clean(p.meetingPersonId),
      number: clean(p.nr),
      name: personName(p),
      goalkeeper: toInt(p.personType ?? p.type) === PERSON_TYPE.GOALKEEPER,
      ...(stats.get(p.meetingPersonId) ?? empty),
    });
  }
  for (const o of officials ?? []) {
    const side = o.teamHome === true ? 'home' : o.teamHome === false ? 'away' : null;
    if (!side) continue;
    lineup[side].officials.push({
      id: clean(o.meetingPersonId),
      role: clean(o.nr),
      name: personName(o),
      ...(stats.get(o.meetingPersonId) ?? empty),
    });
  }
  for (const side of ['home', 'away']) {
    lineup[side].players.sort(byNumber);
    lineup[side].officials.sort((a, b) => String(a.role ?? '').localeCompare(String(b.role ?? '')));
  }

  const ofType = (type) =>
    (fedOfficials ?? [])
      .filter((p) => toInt(p.personType ?? p.type) === type)
      .sort((a, b) => String(a.nr ?? '').localeCompare(String(b.nr ?? '')))
      .map(personName)
      .filter(Boolean);

  lineup.referees = ofType(PERSON_TYPE.REFEREE);
  lineup.timekeeper = ofType(PERSON_TYPE.TIMEKEEPER)[0] ?? null;
  lineup.secretary = ofType(PERSON_TYPE.SECRETARY)[0] ?? null;
  return lineup;
}

module.exports = {
  mapLineup,
  EVENT_CODES,
  parseScheduled,
  formatClock,
  normalizeTeamName,
  mapMeetingSummary,
  mapNuScoreTicker,
};
