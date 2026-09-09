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

const { TTL, STALE_TTL, decodeGameId } = require('../config/handball');
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
} = require('./handballMapper');

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
function getSchedule(teamId) {
  return loadCached(
    `schedule:${teamId}`,
    TTL.schedule,
    async () => {
      const { $ } = await loadTeamPortrait(teamId);
      const context = {
        ...mapGroupContext($),
        // Nötig für „Heim oder Auswärts?": der Spielplan nennt nur Namen.
        teamName: mapTeamName($),
      };
      return mapSchedule($, teamId, context);
    },
    { teamId, games: [] }
  );
}

// ------------------------------------------------------------- Live-Ticker --

/**
 * Ticker eines Spiels: Spielinfo + Ereignisliste aus dem nuLiga-Spielbericht.
 *
 * Die TTL hängt am Spielzustand: nur ein LAUFENDES Spiel wird im
 * 10-Sekunden-Takt neu geholt. Ein abgepfiffenes oder noch nicht angeworfenes
 * Spiel würde sonst dauerhaft Requests erzeugen, obwohl sich nichts ändert.
 *
 * @param {string} gameId zusammengesetzte ID `meeting.group.championship`
 */
function getTicker(gameId) {
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
  };

  return loadCached(
    `ticker:${gameId}`,
    (data) => (data.state === 'live' ? TTL.tickerLive : TTL.tickerIdle),
    async () => {
      const parts = decodeGameId(gameId);
      if (!parts) throw new Error('Spiel-ID ist nicht lesbar.');

      const { $ } = await loadMeetingReport(parts);
      return mapTicker($, gameId);
    },
    leer
  );
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

module.exports = {
  getTable,
  getSchedule,
  getTicker,
  getCacheStats,
  clearCache,
};
