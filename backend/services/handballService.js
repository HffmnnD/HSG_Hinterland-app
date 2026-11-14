// Fachlogik des Handball-Moduls: Cache, Zusammenbau und Ausfallsicherheit.
//
// Die dreistufige Absicherung ist gegenüber der handball.net-Anbindung
// unverändert – nur die Datenquelle darunter ist jetzt nuLiga (HHV):
//
//   1. FRISCH-CACHE (node-cache, kurze TTL)
//      Beantwortet die allermeisten Requests, ohne nuLiga zu behelligen.
//      Tabelle/Spielplan 15 Min, laufender Ticker 10 s.
//
//   2. ANFRAGE-BÜNDELUNG (in-flight map)
//      Laufen 30 Handys gleichzeitig in einen abgelaufenen Ticker-Cache,
//      geht trotzdem nur EIN Request zum Verband; alle warten auf dasselbe
//      Promise. Bei HTML-Seiten von 40–55 KB zählt das doppelt.
//
//   3. NOTRESERVE (stale cache, 24 h)
//      Schlägt der Abruf fehl – Netzwerk, HTTP-Fehler ODER ein Selektor, der
//      nach einem nuLiga-Umbau nicht mehr greift –, wird der zuletzt
//      erfolgreiche Stand geliefert und als `stale: true` markiert. Gibt es
//      auch den nicht, kommt ein leeres, strukturell gültiges DTO mit
//      `available: false` zurück. Die App bekommt so NIE einen Fehler, an dem
//      sie abstürzen könnte.
//
// Beide Caches sind in der Schlüsselzahl BEGRENZT (MAX_KEYS). Ohne diese
// Grenze könnte ein angemeldetes Konto über viele verschiedene, formal gültige
// IDs beliebig viele Einträge anlegen, die wegen der 24-Stunden-Notreserve
// einen ganzen Tag im Speicher blieben.
const NodeCache = require('node-cache');

const {
  TTL,
  STALE_TTL,
  NUSCORE_ENABLED,
  decodeGameId,
  encodeGameId,
} = require('../config/handball');
const nuScore = require('./nuScoreLiveClient');
const nuScoreSocket = require('./nuScoreLiveSocket');
const tickerLoad = require('./tickerLoad');
const { buildSummary } = require('./tickerSummary');
const tickerEventTimes = require('./tickerEventTimes');
const {
  mapMeetingSummary,
  mapNuScoreTicker,
  mapLineup,
  normalizeTeamName,
  formatClock,
} = require('./nuScoreLiveMapper');
const {
  loadTeamPortrait,
  loadGroupPage,
  loadMeetingReport,
  HandballUpstreamError,
} = require('./handballClient');
const {
  HandballStructureError,
  mapGroupContext,
  mapTeamName,
  mapTable,
  mapSchedule,
  mapTicker,
  deriveState,
} = require('./handballMapper');

// ---------------------------------------------------- Zustand zur Abrufzeit --
//
// Der Spielzustand (upcoming/live/finished) hängt an der UHRZEIT, nicht nur an
// den Daten von nuLiga. Er wird deshalb bei JEDER Auslieferung neu berechnet –
// sonst bliebe ein Spiel, das kurz vor Anwurf in den Cache kam, bis zu 15
// Minuten (bei einem nuLiga-Ausfall sogar 24 Stunden) „upcoming“, obwohl längst
// gespielt wird. Ein veröffentlichtes Ergebnis bleibt „finished“.
const refreshGame = (game) =>
  game && game.state !== 'finished' && game.state !== 'cancelled'
    ? { ...game, state: deriveState(game.startsAt, false) }
    : game;

function withLiveSchedule(data) {
  if (!Array.isArray(data.games)) return data;
  return { ...data, games: data.games.map(refreshGame) };
}

// --------------------------------------------- mitlaufende Uhr (nuScoreLive) --
//
// nuScoreLive meldet nur die Spielsekunde jeder Aktion, keine Uhrzeit. Läuft
// die Uhr (letztes Steuerereignis = „Zeit läuft"), wird ab dem Moment, in dem
// wir die jüngste Aktion zum ersten Mal gesehen haben, hochgezählt – genau so
// macht es auch der offizielle Web-Ticker. Mit Push ist der Zeitpunkt der
// Aktion sekundengenau; ohne Push hinkt die Uhr höchstens um den Abfragetakt
// hinterher. An der Halbzeitgrenze bleibt sie stehen.
const clockAnchors = new Map(); // meetingId -> { idx, seenAt }

function anchorClock(data) {
  const live = data?.live;
  if (!live?.meetingId) return data;
  const known = clockAnchors.get(live.meetingId);
  if (!known || known.idx !== live.latestIdx) {
    // Kam die jüngste Aktion per Push, kennen wir ihren Zeitpunkt genau.
    const pushed = nuScoreSocket.latestPush(live.meetingId);
    const seenAt = pushed && pushed.idx === live.latestIdx ? pushed.at : Date.now();
    clockAnchors.set(live.meetingId, { idx: live.latestIdx, seenAt });
    // Speicher begrenzen – ein Spieltag hat nur eine Handvoll Spiele.
    if (clockAnchors.size > 200) clockAnchors.delete(clockAnchors.keys().next().value);
  }
  return data;
}

function withRunningClock(data, now = Date.now()) {
  const live = data?.live;
  if (!live?.clockRunning || data.clockSeconds === null) return data;
  const anchor = clockAnchors.get(live.meetingId);
  if (!anchor) return data;

  const half = (live.halftimeMinutes || 30) * 60;
  const base = data.clockSeconds;
  const limit = base < half ? half : 2 * half;
  const seconds = Math.min(base + Math.max(0, Math.floor((now - anchor.seenAt) / 1000)), limit);
  return {
    ...data,
    clockSeconds: seconds,
    clock: formatClock(seconds),
    period: seconds > half ? 2 : 1,
  };
}

function withLiveTicker(data) {
  if (!data.game || data.state === 'finished') return withRunningClock(data);
  // nuScoreLive weiß selbst, ob gespielt wird – dann nicht nach Uhrzeit raten.
  if (data.live?.provider === 'nuScoreLive' && data.state === 'live') {
    return withRunningClock(data);
  }
  const game = refreshGame(data.game);
  return { ...data, game, state: game.state };
}

// Rund um einen Anwurf (30 min davor bis 3 h danach) schneller nachladen.
const MATCH_WINDOW_BEFORE_MS = 30 * 60_000;
const MATCH_WINDOW_AFTER_MS = 3 * 3600_000;
function nearKickoff(startsAt, now = Date.now()) {
  if (!startsAt) return false;
  const start = new Date(startsAt).getTime();
  return (
    !Number.isNaN(start) &&
    now >= start - MATCH_WINDOW_BEFORE_MS &&
    now <= start + MATCH_WINDOW_AFTER_MS
  );
}

// Obergrenze je Cache. Der Verein hat rund ein Dutzend Mannschaften und
// dazu die Spiele einer Saison – 500 Einträge sind dafür reichlich und
// begrenzen den Speicher zugleich auf wenige Megabyte.
const MAX_KEYS = Number.parseInt(process.env.HANDBALL_MAX_CACHE_KEYS, 10) || 500;

// useClones: false spart das tiefe Kopieren bei jedem Treffer. Zulässig, weil
// die zwischengespeicherten DTOs nur gelesen und nie mutiert werden.
const freshCache = new NodeCache({
  stdTTL: TTL.table,
  useClones: false,
  maxKeys: MAX_KEYS,
});
const staleCache = new NodeCache({
  stdTTL: STALE_TTL,
  useClones: false,
  maxKeys: MAX_KEYS,
});

/**
 * Schreibt in einen Cache und räumt auf, wenn er voll ist.
 *
 * node-cache verdrängt nichts von selbst, sondern wirft bei Überlauf
 * `ECACHEFULL`. Statt das durchschlagen zu lassen (der Abruf hat ja
 * funktioniert), werden die Einträge mit der kürzesten Restlaufzeit entfernt
 * und es wird einmal erneut versucht. Klappt auch das nicht, wird die Antwort
 * eben ungecacht ausgeliefert – langsamer, aber korrekt.
 */
function safeSet(cache, key, value, ttl) {
  const versuch = () => {
    if (ttl === undefined) cache.set(key, value);
    else cache.set(key, value, ttl);
  };

  try {
    versuch();
  } catch {
    const keys = cache.keys();
    // Zehn Prozent der ältesten Einträge (kürzeste Restlaufzeit) räumen.
    const opfer = keys
      .map((k) => ({ k, ttl: cache.getTtl(k) ?? 0 }))
      .sort((a, b) => a.ttl - b.ttl)
      .slice(0, Math.max(1, Math.ceil(keys.length / 10)))
      .map((e) => e.k);
    cache.del(opfer);
    console.warn(
      `[handball] Cache voll (${keys.length} Schlüssel) – ${opfer.length} älteste entfernt.`
    );
    try {
      versuch();
    } catch {
      console.warn(`[handball] ${key} konnte nicht gecacht werden.`);
    }
  }
}

/** Laufende Upstream-Anfragen: Cache-Schlüssel -> Promise. */
const inFlight = new Map();

/**
 * Einheitliche Antworthülle. `meta` sagt der UI, wie belastbar die Daten sind.
 */
function envelope(data, meta) {
  return {
    ...data,
    meta: {
      // 'network' = frisch geholt | 'cache' = Frisch-Cache | 'stale' = Notreserve
      // | 'unavailable' = nichts vorhanden
      source: meta.source,
      stale: meta.stale ?? false,
      available: meta.available ?? true,
      fetchedAt: meta.fetchedAt ?? null,
    },
  };
}

/** Kurze, aussagekräftige Zeile fürs Log – ohne Stacktrace. */
function describeError(err) {
  if (err instanceof HandballUpstreamError) {
    return `${err.message} (HTTP ${err.status || 'n/a'})`;
  }
  if (err instanceof HandballStructureError) {
    // Der Abruf hat funktioniert, die Seite sieht nur anders aus als erwartet.
    // Das ist der Fall, der eine Anpassung von handballMapper.js braucht –
    // deshalb im Log deutlich als solcher gekennzeichnet.
    return `SEITENSTRUKTUR GEÄNDERT? ${err.message}`;
  }
  return `${err?.name ?? 'Fehler'}: ${err?.message ?? String(err)}`;
}

/**
 * Kern des Caches: liefert `loader()` gecacht, gebündelt und ausfallsicher.
 *
 * @param {string} key       Cache-Schlüssel
 * @param {number|((data:object) => number)} ttl Sekunden für den Frisch-Cache
 *        (als Funktion: darf vom Ergebnis abhängen, siehe Ticker)
 * @param {() => Promise<object>} loader holt und normalisiert die Daten
 * @param {object} fallback  strukturell gültiges Leer-DTO
 */
async function loadCached(key, ttl, loader, fallback) {
  const cached = freshCache.get(key);
  if (cached) {
    return envelope(cached.data, {
      source: 'cache',
      fetchedAt: cached.fetchedAt,
    });
  }

  // Läuft bereits eine Anfrage für denselben Schlüssel? Dann anhängen.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const data = await loader();
      const entry = { data, fetchedAt: new Date().toISOString() };

      safeSet(freshCache, key, entry, typeof ttl === 'function' ? ttl(data) : ttl);
      // Die Notreserve bekommt denselben Stand mit langer Haltbarkeit.
      safeSet(staleCache, key, entry);

      return envelope(data, { source: 'network', fetchedAt: entry.fetchedAt });
    } catch (err) {
      console.warn(`[handball] ${key}: ${describeError(err)}`);

      const stale = staleCache.get(key);
      if (stale) {
        return envelope(stale.data, {
          source: 'stale',
          stale: true,
          fetchedAt: stale.fetchedAt,
        });
      }

      // Wirklich nichts vorhanden: leeres, gültiges DTO statt eines Fehlers.
      return envelope(fallback, {
        source: 'unavailable',
        available: false,
        stale: true,
      });
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

// ---------------------------------------------------------------- Tabelle ---

/**
 * Tabelle der Staffel, in der die Mannschaft spielt.
 *
 * Zwei Schritte, weil nuLiga die Tabelle nicht an der Mannschaft, sondern an
 * der Staffel führt:
 *   1. Mannschaftsseite holen -> daraus championship + group lesen
 *   2. Staffelseite holen -> Tabelle auslesen
 * Wegen des 15-Minuten-Caches sind das zwei Requests je Viertelstunde.
 *
 * @param {string} teamId nuLiga-`teamtable`-ID (bereits validiert)
 */
function getTable(teamId) {
  return loadCached(
    `table:${teamId}`,
    TTL.table,
    async () => {
      const team = await loadTeamPortrait(teamId);
      const context = mapGroupContext(team.$);

      if (!context.championship || !context.group) {
        // Ohne Staffelverweis ist die Seite unbrauchbar – als Fehler behandeln,
        // damit die Notreserve greift statt eine leere Tabelle zu cachen.
        throw new Error(
          'Auf der Mannschaftsseite ist keine Staffel verlinkt (Team-ID falsch?).'
        );
      }

      const group = await loadGroupPage(context.championship, context.group);
      return mapTable(group.$, teamId, context);
    },
    { teamId, competition: null, season: null, rows: [] }
  );
}

// --------------------------------------------------------------- Spielplan --

/**
 * Spielplan der Mannschaft (vergangene und kommende Spiele).
 * Ein einziger Request – die Mannschaftsseite enthält den Spielplan direkt.
 *
 * @param {string} teamId
 */
async function getSchedule(teamId) {
  const result = await loadCached(
    `schedule:${teamId}`,
    // Am Spieltag öfter fragen – Ergebnis und Spielbericht erscheinen sonst
    // erst nach einer Viertelstunde in der App.
    (data) =>
      (data.games ?? []).some((game) => game.state !== 'finished' && nearKickoff(game.startsAt))
        ? Math.min(TTL.schedule, 120)
        : TTL.schedule,
    async () => {
      const { $ } = await loadTeamPortrait(teamId);
      const context = {
        ...mapGroupContext($),
        // Nötig für „Heim oder Auswärts?": der Spielplan nennt nur Namen.
        teamName: mapTeamName($),
      };
      const schedule = mapSchedule($, teamId, context);
      await attachLiveTickerIds(schedule.games, context);
      return schedule;
    },
    { teamId, games: [] }
  );
  return withLiveSchedule(result);
}

// ------------------------------------------- Ticker-IDs vor dem Spielbericht --

/**
 * Spiele einer Staffel bei nuScoreLive (Fenster rund um heute), kurz gecacht.
 * @param {string} group nuLiga-`group` (= nuScoreLive-Gruppen-ID)
 */
async function getNuScoreGroupMeetings(group) {
  const result = await loadCached(
    `nuscore-group:${group}`,
    60,
    async () => {
      const data = await nuScore.loadGroupMeetings(group);
      return { meetings: (data.meetings ?? []).map(mapMeetingSummary) };
    },
    { meetings: [] }
  );
  return result.meetings ?? [];
}

/**
 * nuLiga verlinkt ein Spiel erst, wenn es einen Spielbericht gibt – also erst
 * NACH dem Anwurf (oder gar erst nach dem Spiel). nuScoreLive kennt die Spiele
 * dagegen vorher, mit derselben Spielnummer wie nuLiga. Für Spiele rund um
 * den Anwurf ohne ID wird die Nummer deshalb über Anwurfzeit + Mannschafts-
 * namen bei nuScoreLive nachgeschlagen. Damit bekommt JEDE Mannschaft ihren
 * Live-Ticker – allein über die hinterlegte nuLiga-Nummer (teamtable).
 *
 * Fehler hier sind nie fatal: dann bleibt es beim bisherigen Verhalten.
 */
async function attachLiveTickerIds(games, context) {
  if (!NUSCORE_ENABLED || !context.group || !context.championship) return;
  // Alle Spiele rund um den Anwurf – auch solche, die nuLiga schon als
  // „beendet" führt: Bei live erfassten Spielen zeigt nuLiga im Spielplan
  // vorab 0:0 und während des Spiels den Zwischenstand. Ohne Korrektur hielte
  // die App ein laufendes Spiel für abgepfiffen und zeigte keinen Live-Ticker.
  // nuScoreLive liefert ohnehin nur ein Fenster um heute (rund eine Woche);
  // so bekommen auch Spiele später am Tag schon ihre ID und ihren Zustand.
  const WINDOW_MS = 7 * 24 * 3600_000;
  const candidates = games.filter(
    (g) => g.startsAt && Math.abs(new Date(g.startsAt).getTime() - Date.now()) <= WINDOW_MS
  );
  if (candidates.length === 0) return;

  let meetings;
  try {
    meetings = await getNuScoreGroupMeetings(context.group);
  } catch {
    return;
  }

  for (const game of candidates) {
    const kickoff = new Date(game.startsAt).getTime();
    const home = normalizeTeamName(game.home?.name);
    const away = normalizeTeamName(game.away?.name);

    const knownMeeting = game.id ? decodeGameId(game.id)?.meeting : null;

    const match = meetings.find((m) => {
      if (!m.meetingId || !m.enabled) return false;
      if (knownMeeting) return m.meetingId === knownMeeting;
      if (!m.startsAt) return false;
      // Gleiche Begegnung am selben Tag (Anwurf ± 3 h – falls kurzfristig verlegt).
      const sameTime = Math.abs(new Date(m.startsAt).getTime() - kickoff) <= 3 * 3600_000;
      return (
        sameTime &&
        normalizeTeamName(m.home) === home &&
        normalizeTeamName(m.away) === away
      );
    });

    if (!match) continue;

    game.id =
      game.id ??
      encodeGameId({
        meeting: match.meetingId,
        group: context.group,
        championship: context.championship,
      });
    game.liveTicker = true;

    if (match.live) {
      game.state = 'live';
      game.homeGoals = match.homeGoals;
      game.awayGoals = match.awayGoals;
    } else if (
      game.state === 'finished' &&
      game.homeGoals === 0 &&
      game.awayGoals === 0 &&
      !match.homeGoals &&
      !match.awayGoals
    ) {
      // 0:0 ist hier kein Ergebnis, sondern der Platzhalter vor dem Anwurf.
      game.state = deriveState(game.startsAt, false);
      game.homeGoals = null;
      game.awayGoals = null;
    }
  }
}

// ------------------------------------------------------------- Live-Ticker --

// Welche App-Spiel-IDs gehören zu einer Spielnummer? (Für das Verwerfen des
// Caches, wenn per Push eine neue Aktion gemeldet wird.)
const gameIdsByMeeting = new Map(); // meetingId -> Set<gameId>

function rememberGameId(meetingId, gameId) {
  if (!gameIdsByMeeting.has(meetingId)) {
    gameIdsByMeeting.set(meetingId, new Set());
    if (gameIdsByMeeting.size > 300) gameIdsByMeeting.delete(gameIdsByMeeting.keys().next().value);
  }
  gameIdsByMeeting.get(meetingId).add(gameId);
}

// Neue Aktion per Push -> Ticker-Cache des Spiels sofort verwerfen. Der
// nächste Abruf (spätestens 2 s später vom ersten Handy) holt den frischen
// Stand; alle weiteren Handys bekommen ihn aus dem Cache.
//
// Zugleich wird die Empfangszeit jeder gemeldeten Aktion dauerhaft notiert –
// daraus entstehen die echten Uhrzeiten („Anpfiff 18:02 Uhr"). Nachträglich
// dokumentierte Aktionen (Typ 1) bekommen KEINE Uhrzeit: ihr Empfang ist
// nicht der Zeitpunkt der Aktion.
nuScoreSocket.onUpdate((meetingId, info) => {
  for (const gameId of gameIdsByMeeting.get(meetingId) ?? []) {
    freshCache.del(`ticker:${gameId}`);
  }
  if (info && !info.documented) {
    for (const event of info.events) {
      tickerEventTimes.recordPush(meetingId, event.idx, event.code, info.at).catch(() => {});
    }
  }
});

// Personen (Kader, Offizielle, Schiedsgericht) ändern sich während eines
// Spiels so gut wie nie – eine Minute Cache spart drei Abrufe je Takt.
const personsCache = new NodeCache({ stdTTL: 60, useClones: false, maxKeys: 200 });

async function loadPersons(meetingId) {
  const cached = personsCache.get(meetingId);
  if (cached) return cached;
  const safe = (promise) => promise.then((d) => d.meetingPersons ?? []).catch(() => []);
  const [players, officials, fedOfficials] = await Promise.all([
    safe(nuScore.loadPlayers(meetingId)),
    safe(nuScore.loadOfficials(meetingId)),
    safe(nuScore.loadFedOfficials(meetingId)),
  ]);
  const persons = { players, officials, fedOfficials };
  safeSet(personsCache, meetingId, persons);
  return persons;
}

/**
 * Ticker eines Spiels: Kopf, Spielverlauf, Zusammenfassung und Spielkader.
 *
 * Quellen, in dieser Reihenfolge:
 *   1. nuScoreLive (JSON, live) – sobald es dort Ereignisse gibt
 *   2. nuLiga-Spielbericht (HTML) – Spiele ohne Live-Erfassung, ältere Spiele
 *   3. nuScoreLive ohne Ereignisse – Vorschau vor dem Anwurf
 *
 * Frische eines LAUFENDEN Spiels: Ist der Push-Kanal zu nuScoreLive aktiv,
 * darf der Eintrag 15 s liegen – er wird bei jeder neuen Aktion ohnehin sofort
 * verworfen. Ohne Push gilt TTL.tickerLive (2 s). Gleichzeitige Anfragen
 * bündelt loadCached, so dass nuScoreLive je Spiel höchstens einen Abruf pro
 * Takt sieht – egal wie viele Handys zuschauen.
 *
 * @param {string} gameId zusammengesetzte ID `meeting.group.championship`
 */
async function getTicker(gameId) {
  const leer = {
    gameId,
    game: null,
    state: 'upcoming',
    homeGoals: null,
    awayGoals: null,
    clock: null,
    clockSeconds: null,
    period: null,
    events: [],
    summary: null,
    crew: null,
  };

  const parts = decodeGameId(gameId);

  const result = await loadCached(
    `ticker:${gameId}`,
    (data) => {
      if (data.state === 'live') {
        return parts && nuScoreSocket.isWatching(parts.meeting) ? 15 : TTL.tickerLive;
      }
      return data.state === 'upcoming' && nearKickoff(data.game?.startsAt)
        ? 10
        : TTL.tickerIdle;
    },
    async () => {
      if (!parts) throw new Error('Spiel-ID ist nicht lesbar.');
      rememberGameId(parts.meeting, gameId);

      // Spielübersicht (Kader + Statistik je Person + Summen) aus Ereignissen
      // und – wenn vorhanden – dem nuScoreLive-Kader. Das Schiedsgericht
      // steht separat in `crew`.
      const withExtras = (dto, lineup = null) => ({
        ...dto,
        summary: buildSummary(dto, lineup),
        crew: lineup
          ? {
              referees: lineup.referees ?? [],
              timekeeper: lineup.timekeeper ?? null,
              secretary: lineup.secretary ?? null,
            }
          : null,
      });

      // 1. Wahl: nuScoreLive (echter Live-Ticker, JSON, sekundengenau).
      const live = await loadNuScoreTicker(parts.meeting, gameId);
      if (live && live.ticker.events.length > 0) return withExtras(live.ticker, live.lineup);

      // 2. Wahl: nuLiga-Spielbericht – für Spiele ohne Live-Erfassung oder
      // wenn nuScoreLive gerade nicht antwortet.
      try {
        const { $ } = await loadMeetingReport(parts);
        return withExtras(mapTicker($, gameId), live?.lineup ?? null);
      } catch (err) {
        // Noch kein Spielbericht, aber nuScoreLive kennt das Spiel (typisch
        // kurz vor Anwurf): dessen Stand ist besser als gar nichts.
        if (live) return withExtras(live.ticker, live.lineup);
        throw err;
      }
    },
    leer
  );
  return withLiveTicker(anchorClock(result));
}

/**
 * Ticker aus nuScoreLive -> { ticker, lineup } oder null, wenn das Spiel dort
 * nicht geführt wird. Wirft nie – ein Ausfall von nuScoreLive fällt auf den
 * nuLiga-Bericht zurück.
 */
async function loadNuScoreTicker(meetingId, gameId) {
  if (!NUSCORE_ENABLED) return null;
  try {
    const meeting = await nuScore.loadMeeting(meetingId);
    if (meeting.nuScoreLiveEnabled === false || !meeting.meetingID) return null;

    // Version für den Spielverlauf: die zuletzt per Push gemeldete ist am
    // frischesten; sonst die aus dem Spielkopf (bis zu 15 s alt).
    const pushed = nuScoreSocket.latestPush(meetingId);
    const version = pushed?.version ?? meeting.versionUid;

    const [events, persons] = await Promise.all([
      nuScore.loadEvents(meetingId, version),
      loadPersons(meetingId),
    ]);
    const rawEvents = Array.isArray(events.events) ? events.events : [];

    const ticker = mapNuScoreTicker(meeting, rawEvents, persons.players, gameId);
    // Laufende Spiele – und Spiele kurz vor dem Anwurf, damit schon der
    // Anpfiff seine Uhrzeit bekommt – beim Push-Kanal anmelden.
    const aroundKickoff = ticker.state === 'upcoming' && nearKickoff(ticker.game?.startsAt);
    if (ticker.state === 'live' || aroundKickoff) {
      nuScoreSocket.watch(meetingId, meeting.meetingUuid);
    }

    // Echte Uhrzeiten: neu aufgetauchte Aktionen notieren (nur während des
    // Spiels) und alle bekannten an die Ereignisse hängen.
    await tickerEventTimes.observeRest(meetingId, rawEvents, ticker.state === 'live');
    const times = await tickerEventTimes.timesFor(meetingId);
    for (const event of ticker.events) {
      const idx = Number.parseInt(String(event.id).replace(/^ns-/, ''), 10);
      const seen = times.get(idx);
      if (seen) {
        event.observedAt = seen.at.toISOString();
        event.observedVia = seen.source;
      }
    }

    return {
      ticker,
      lineup: mapLineup(persons.players, persons.officials, persons.fedOfficials, rawEvents),
    };
  } catch (err) {
    if (err instanceof HandballUpstreamError) tickerLoad.recordUpstreamError();
    console.warn(`[handball] nuScoreLive ${meetingId}: ${describeError(err)}`);
    return null;
  }
}

// ------------------------------------------------------------------ Betrieb --

/** Cache-Kennzahlen – nützlich für einen späteren Health-Endpunkt. */
function getCacheStats() {
  return {
    fresh: { keys: freshCache.keys().length, ...freshCache.getStats() },
    stale: { keys: staleCache.keys().length },
    inFlight: inFlight.size,
  };
}

/** Leert die Caches (Tests, manuelles Nachladen durch die Verwaltung). */
function clearCache() {
  freshCache.flushAll();
  staleCache.flushAll();
}

/** Zustand von Push-Kanal und Last – für das System-Monitoring. */
function getLiveStatus() {
  return { socket: nuScoreSocket.status(), load: tickerLoad.status() };
}

module.exports = {
  getLiveStatus,
  getTable,
  getSchedule,
  getTicker,
  getCacheStats,
  clearCache,
};
