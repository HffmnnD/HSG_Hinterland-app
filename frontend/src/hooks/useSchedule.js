import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Baut einen Query-String aus definierten Werten (leere überspringt er).
 * @param {Record<string, string|number|null|undefined>} params
 */
function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Gemeinsames Ladeverhalten aller Hooks hier.
 *
 * Der Zustand merkt sich, zu WELCHEM Pfad die Daten gehören. Daraus ergibt
 * sich `loading`, ohne im Effekt-Körper setState aufzurufen (das löst
 * Kaskaden-Renders aus – siehe hooks/useNews.js). Beim Wechsel des Pfads
 * (anderer Mannschafts-Filter, anderer Zeitraum) bleibt der alte Inhalt so
 * lange stehen, bis die neue Antwort da ist; die Panels zeigen währenddessen
 * ihren Platzhalter.
 *
 * @param {string|null} path null = nichts laden (z. B. Mannschaft noch offen)
 * @param {(data:any) => any} select Antwort -> Zustand
 * @param {any} fallback Startwert, solange nichts geladen ist
 */
function useApiResource(path, select, fallback) {
  const [state, setState] = useState({
    path: null,
    data: fallback,
    error: null,
  });

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const result = await apiFetch(path);
      setState({ path, data: select(result), error: null });
    } catch (err) {
      setState((current) => ({ ...current, path, error: err.message }));
    }
    // `select` ist in jedem Aufrufer eine stabile Modulfunktion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (!path) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(path);
        if (!cancelled) setState({ path, data: select(result), error: null });
      } catch (err) {
        if (!cancelled) {
          setState((current) => ({ ...current, path, error: err.message }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return {
    data: state.data,
    loading: Boolean(path) && state.path !== path,
    error: state.error,
    reload,
  };
}

const selectEvents = (result) => ({
  events: result?.events ?? [],
  teams: result?.teams ?? [],
  range: result?.range ?? null,
});

const EMPTY_EVENTS = { events: [], teams: [], range: null };

/**
 * Termine einer oder aller eigenen Mannschaften im Zeitraum.
 *
 * @param {{ teamId?: number|null, from?: string|null, to?: string|null }} opts
 */
export function useEvents({ teamId = null, from = null, to = null } = {}) {
  const path = `/api/events${query({ teamId, from, to })}`;
  const { data, loading, error, reload } = useApiResource(
    path,
    selectEvents,
    EMPTY_EVENTS
  );

  return {
    events: data.events,
    // Die Mannschaftsliste kommt mit der Terminliste zurück – sie beantwortet
    // dieselbe Frage („worauf habe ich Zugriff?") und spart einen Request.
    teams: data.teams,
    range: data.range,
    loading,
    error,
    reload,
  };
}

const selectAbsences = (result) => result?.absences ?? [];
const EMPTY_LIST = [];

/**
 * Dauerhafte Abwesenheiten.
 * Ohne `teamId` die eigenen, mit `teamId` (und Trainerrechten) die des Kaders.
 */
export function useAbsences({ teamId = null, includePast = false } = {}) {
  const path = `/api/absences/long-term${query({
    teamId,
    includePast: includePast ? 'true' : null,
  })}`;
  const { data, loading, error, reload } = useApiResource(
    path,
    selectAbsences,
    EMPTY_LIST
  );
  return { absences: data, loading, error, reload };
}

const selectHistory = (result) => result ?? null;

/**
 * Langzeit-Historie und Trainingsbeteiligung einer Mannschaft.
 * `teamId` ist Pflicht – ohne Mannschaft wird nichts geladen.
 */
export function useAttendanceHistory({
  teamId = null,
  userId = null,
  from = null,
  to = null,
  type = null,
} = {}) {
  const path = teamId
    ? `/api/attendances/history${query({ teamId, userId, from, to, type })}`
    : null;
  const { data, loading, error, reload } = useApiResource(
    path,
    selectHistory,
    null
  );
  return { history: data, loading, error, reload };
}

const selectSeries = (result) => result?.series ?? [];

/** Trainingsserien einer Mannschaft (nur Verwaltung). */
export function useEventSeries(teamId) {
  const path = teamId ? `/api/events/series${query({ teamId })}` : null;
  const { data, loading, error, reload } = useApiResource(
    path,
    selectSeries,
    EMPTY_LIST
  );
  return { series: data, loading, error, reload };
}
