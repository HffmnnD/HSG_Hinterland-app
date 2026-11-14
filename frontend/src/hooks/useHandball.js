import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Hooks für die Verbandsdaten (nuLiga/HHV) aus `/api/handball/*`.
 *
 * Wichtig zum Verständnis: Das Backend antwortet auch bei einem Ausfall des
 * Verbands mit HTTP 200 und einem gültigen (ggf. leeren) DTO – erkennbar an
 * `meta.available === false` bzw. `meta.stale === true`. `error` wird hier
 * deshalb nur bei ECHTEN Problemen gesetzt (kein Netz, Sitzung abgelaufen,
 * Serverfehler). Die Widgets unterscheiden entsprechend zwei Fälle:
 *   error        -> „Da lief etwas schief."
 *   meta.stale   -> Daten sind da, aber nicht taufrisch.
 */

// Wie oft ein LAUFENDES Spiel neu geholt wird, solange der Server nichts
// anderes vorgibt. Normalerweise kommt der Takt aus der Antwort selbst
// (`poll.afterMs`): der Server streckt ihn, wenn er oder nuScoreLive unter
// Last steht.
const LIVE_INTERVAL_MS = 2_000;

// Startwert des Backoffs nach „zu viele Anfragen" (HTTP 429).
const RATE_LIMITED_MS = 15_000;

// Takt für Spiele, die noch nicht angeworfen sind.
const IDLE_INTERVAL_MS = 60_000;

// Ab dieser Zeit vor Anwurf wird bereits im Live-Takt gepollt, damit der
// Ticker mit der ersten Aktion sofort dabei ist.
const PRE_GAME_WINDOW_MS = 10 * 60_000;

// Obergrenze für den Wartezeit-Aufschlag nach Fehlern.
const MAX_BACKOFF_MS = 60_000;

/**
 * Einmaliges Laden einer Ressource (Tabelle, Spielplan).
 *
 * Das Ergebnis wird zusammen mit dem Pfad abgelegt, zu dem es gehört. Daraus
 * ergibt sich `loading` rein rechnerisch – so muss der Effekt beim Wechsel der
 * Mannschaft keinen Ladezustand setzen (das löste sonst eine zusätzliche
 * Render-Runde aus, siehe react-hooks/set-state-in-effect).
 *
 * @param {string|null} path API-Pfad; null -> es wird nichts geladen
 */
function useHandballResource(path) {
  const [entry, setEntry] = useState({ path: null, data: null, error: null });

  // Solange das abgelegte Ergebnis zu einem anderen Pfad gehört, wird geladen.
  const loading = Boolean(path) && entry.path !== path;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const data = await apiFetch(path);
      setEntry({ path, data, error: null });
    } catch (err) {
      setEntry((prev) => ({ ...prev, path, error: err.message }));
    }
  }, [path]);

  useEffect(() => {
    if (!path) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch(path);
        if (!cancelled) setEntry({ path, data, error: null });
      } catch (err) {
        if (!cancelled) setEntry({ path, data: null, error: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return {
    // Beim Wechsel der Mannschaft nicht kurz die alten Daten zeigen.
    data: entry.path === path ? entry.data : null,
    loading,
    error: entry.path === path ? entry.error : null,
    reload,
  };
}

/**
 * Tabelle der Liga, in der die Mannschaft spielt.
 *
 * @param {string|null} teamId nuLiga-Mannschafts-ID (`teamtable`)
 * @returns {{ table: object|null, rows: object[], meta: object|null,
 *             loading: boolean, error: string|null, reload: Function }}
 */
export function useHandballTable(teamId) {
  const { data, loading, error, reload } = useHandballResource(
    teamId ? `/api/handball/table/${encodeURIComponent(teamId)}` : null
  );

  return {
    table: data,
    rows: data?.rows ?? [],
    meta: data?.meta ?? null,
    loading,
    error,
    reload,
  };
}

/**
 * Spielplan der Mannschaft (alle Spiele, chronologisch).
 *
 * @param {string|null} teamId
 * @returns {{ games: object[], meta: object|null, loading: boolean,
 *             error: string|null, reload: Function }}
 */
export function useHandballSchedule(teamId) {
  const { data, loading, error, reload } = useHandballResource(
    teamId ? `/api/handball/schedule/${encodeURIComponent(teamId)}` : null
  );

  // Am Spieltag den Spielplan selbst nachladen: Ob ein Spiel läuft und ob es
  // schon einen Spielbericht (= Ticker-ID) gibt, steht nur dort. Ohne das sähe
  // jemand, der die Seite vor Anwurf geöffnet hat, den Live-Ticker nie.
  const games = data?.games;

  useEffect(() => {
    // Geprüft wird bei jedem Takt neu – so beginnt das Nachladen auch dann,
    // wenn die Seite schon Stunden vor dem Spiel offen war.
    const isMatchTime = () =>
      (games ?? []).some((game) => {
        if (game.state === 'live') return true;
        if (game.state !== 'upcoming' || !game.startsAt) return false;
        const diff = new Date(game.startsAt).getTime() - Date.now();
        return diff < 30 * 60_000 && diff > -3 * 3600_000;
      });
    if (!(games ?? []).some((g) => g.state !== 'finished')) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden && isMatchTime()) reload();
    }, IDLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [games, reload]);

  return {
    games: data?.games ?? [],
    meta: data?.meta ?? null,
    loading,
    error,
    reload,
  };
}

/**
 * Live-Ticker eines Spiels mit automatischem Nachladen.
 *
 * Das Polling folgt dem Server:
 *   * Ein LAUFENDES Spiel wird alle 2 s abgefragt – oder so oft, wie es der
 *     Server in `poll.afterMs` vorgibt (er streckt den Takt unter Last).
 *   * Vor dem Anwurf genügt ein Blick pro Minute (ab 10 Min davor öfter).
 *   * Nach dem Schlusspfiff hört es ganz auf – ein beendetes Spiel ändert
 *     sich nicht mehr.
 *   * Liegt die App im Hintergrund (Tab gewechselt, Bildschirm aus), pausiert
 *     es und holt beim Zurückkommen sofort den aktuellen Stand. Das spart auf
 *     dem Handy in der Halle spürbar Akku und Datenvolumen.
 *   * Nach Fehlern wird der Takt schrittweise gestreckt (Backoff), damit ein
 *     Ausfall nicht in einer Dauerschleife endet.
 *
 * @param {string|null} gameId Spiel-ID aus dem Spielplan
 * @param {{ enabled?: boolean, intervalMs?: number }} [options]
 * @returns {{ ticker: object|null, events: object[], meta: object|null,
 *             loading: boolean, error: string|null, isPolling: boolean,
 *             refresh: () => void }}
 */
export function useLiveTicker(gameId, options = {}) {
  const { enabled = true, intervalMs = LIVE_INTERVAL_MS } = options;

  // Wie oben: Ergebnis samt zugehöriger Spiel-ID, damit `loading` abgeleitet
  // werden kann, statt im Effekt gesetzt zu werden.
  const [entry, setEntry] = useState({ gameId: null, data: null, error: null });
  const [isPolling, setIsPolling] = useState(false);

  const active = Boolean(gameId && enabled);
  const loading = active && entry.gameId !== gameId;

  // Refs statt State: Änderungen daran dürfen den Effekt NICHT neu starten,
  // sonst entstünde bei jedem Tick ein zweiter Timer.
  const timerRef = useRef(null);
  const failuresRef = useRef(0);
  const stateRef = useRef(null);
  const startsAtRef = useRef(null);
  // Vom Server vorgegebener Takt (undefined = keine Vorgabe, null = Schluss).
  const pollRef = useRef(undefined);
  const rateLimitedRef = useRef(false);
  // Von außen angestoßenes Sofort-Nachladen (refresh()).
  const manualRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    // Bewusst eine lokale Variable statt eines Refs: React führt Effekte im
    // StrictMode zweimal aus. Ein geteiltes Ref würde vom zweiten Durchlauf
    // wieder auf true gesetzt – der bereits laufende erste Tick liefe weiter
    // und legte einen zweiten Timer an. Die Closure hier gehört dagegen genau
    // zu diesem Effekt-Durchlauf.
    let running = true;
    // Zeitpunkt der letzten Abfrage – begrenzt, wie dicht Abfragen aufeinander
    // folgen können (siehe schedule()).
    let lastLoadAt = 0;
    failuresRef.current = 0;

    const path = `/api/handball/ticker/${encodeURIComponent(gameId)}`;

    /** Wartezeit bis zur nächsten Abfrage – oder null, wenn Schluss ist. */
    const nextDelay = () => {
      if (failuresRef.current > 0) {
        // Exponentiell: 4 s -> 8 s -> 16 s … (nach 429 ab 15 s), höchstens
        // eine Minute. Die erste erfolgreiche Antwort setzt zurück auf 2 s.
        const base = rateLimitedRef.current ? RATE_LIMITED_MS : intervalMs;
        return Math.min(base * 2 ** failuresRef.current, MAX_BACKOFF_MS);
      }

      const state = stateRef.current;
      if (state === 'finished' || state === 'cancelled') return null;
      // Vorgabe des Servers hat Vorrang (null = nicht mehr fragen).
      if (pollRef.current !== undefined) {
        return pollRef.current === null ? null : Math.max(pollRef.current, 1000);
      }
      if (state === 'live') return intervalMs;

      // Noch nicht angeworfen: kurz vor Anwurf schon im Live-Takt schauen.
      const startsAt = startsAtRef.current
        ? new Date(startsAtRef.current).getTime()
        : null;
      if (startsAt && startsAt - Date.now() <= PRE_GAME_WINDOW_MS) {
        return intervalMs;
      }
      return IDLE_INTERVAL_MS;
    };

    const schedule = () => {
      if (!running) return;

      const delay = nextDelay();
      // Spiel vorbei -> gar nicht mehr fragen.
      if (delay === null) {
        setIsPolling(false);
        return;
      }
      // App im Hintergrund -> pausieren. Der visibilitychange-Listener holt
      // beim Zurückkommen sofort den aktuellen Stand.
      if (typeof document !== 'undefined' && document.hidden) {
        setIsPolling(false);
        return;
      }

      // Mindestabstand zwischen zwei Abfragen einhalten. Ohne das würde jedes
      // Zurückholen der App sofort eine neue Abfrage auslösen – wer zwischen
      // zwei Apps hin- und herwechselt, erzeugte eine Anfrage-Salve.
      const wait = Math.max(delay - (Date.now() - lastLoadAt), 0);

      setIsPolling(true);
      timerRef.current = window.setTimeout(load, wait);
    };

    async function load() {
      if (!running) return;
      lastLoadAt = Date.now();

      try {
        const data = await apiFetch(path);
        if (!running) return;

        setEntry({ gameId, data, error: null });
        failuresRef.current = 0;
        rateLimitedRef.current = false;
        stateRef.current = data?.state ?? null;
        startsAtRef.current = data?.game?.startsAt ?? null;
        pollRef.current = data?.poll ? (data.poll.afterMs ?? null) : undefined;
      } catch (err) {
        if (!running) return;
        // Vorhandene Daten stehen lassen – ein einzelner Fehlversuch soll den
        // Spielstand auf dem Bildschirm nicht löschen.
        setEntry((prev) => ({ ...prev, gameId, error: err.message }));
        failuresRef.current += 1;
        rateLimitedRef.current = err.status === 429;
      } finally {
        schedule();
      }
    }

    manualRef.current = () => {
      window.clearTimeout(timerRef.current);
      failuresRef.current = 0;
      load();
    };

    const onVisibilityChange = () => {
      window.clearTimeout(timerRef.current);
      if (document.hidden) {
        setIsPolling(false);
        return;
      }
      // Zurück im Vordergrund: schedule() holt sofort nach, wenn der letzte
      // Stand älter als der Takt ist – sonst wartet es den Rest ab.
      schedule();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    load();

    return () => {
      running = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      manualRef.current = null;
    };
  }, [gameId, active, intervalMs]);

  const refresh = useCallback(() => {
    manualRef.current?.();
  }, []);

  const data = entry.gameId === gameId ? entry.data : null;

  return {
    ticker: data,
    events: data?.events ?? [],
    meta: data?.meta ?? null,
    loading,
    error: entry.gameId === gameId ? entry.error : null,
    isPolling,
    refresh,
  };
}
