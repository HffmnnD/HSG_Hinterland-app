import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Seite der Mitgliederliste (`GET /api/admin/users`) inklusive Suche, Filter
 * und Paginierung.
 *
 * Gefiltert wird SERVERSEITIG. Bei 1000+ Konten wäre „alles laden und im
 * Browser filtern" gleich doppelt teuer: rund ein Megabyte JSON je Aufruf und
 * eine Liste, die React bei jedem Tastendruck neu durchrechnet.
 *
 * Zwei Details, die den Unterschied machen:
 *
 *   * Die Suche wird entprellt (`SEARCH_DELAY_MS`) – sonst löst jeder
 *     Tastendruck einen Request aus.
 *   * Antworten überholter Requests werden verworfen (`requestId`). Tippt
 *     jemand schnell „mül", könnte die Antwort auf „mü" nach der auf „mül"
 *     eintreffen und die Tabelle mit veralteten Treffern füllen.
 *
 * @param {{ search?:string, role?:string, status?:string,
 *           page?:number, pageSize?:number }} query
 */
const SEARCH_DELAY_MS = 300;

export function useAdminUsers({ search = '', role = '', status = '', page = 1, pageSize = 20 }) {
  const [data, setData] = useState({
    users: [],
    total: 0,
    page: 1,
    pageCount: 1,
    pageSize,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Zählt hoch bei jedem Start; nur die Antwort mit der höchsten Nummer darf
  // den Zustand setzen.
  const requestId = useRef(0);

  const buildPath = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return `/api/admin/users?${params.toString()}`;
  }, [search, role, status, page, pageSize]);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      const id = requestId.current + 1;
      requestId.current = id;

      if (!quiet) setLoading(true);
      try {
        const result = await apiFetch(buildPath());
        // Überholt? Dann gehört diese Antwort zu einer alten Eingabe.
        if (id !== requestId.current) return;
        setData({
          users: result?.users ?? [],
          total: result?.total ?? 0,
          page: result?.page ?? 1,
          pageCount: result?.pageCount ?? 1,
          pageSize: result?.pageSize ?? pageSize,
        });
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err.message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [buildPath, pageSize]
  );

  // Entprellt: die Suche wartet kurz ab, Filter und Seitenwechsel greifen
  // sofort (dort gibt es keine Tippfolge, die man abwarten müsste).
  useEffect(() => {
    const delay = search.trim() ? SEARCH_DELAY_MS : 0;
    const timer = setTimeout(() => load(), delay);
    return () => clearTimeout(timer);
    // `load` hängt an allen Abfrageparametern – dieser Effekt läuft also bei
    // jeder Änderung der Suche, der Filter oder der Seite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /** Serverstand still nachladen (nach einer gespeicherten Änderung). */
  const reload = useCallback(() => load({ quiet: true }), [load]);

  return { ...data, loading, error, setError, setUsers: patchUsers(setData), reload };
}

/**
 * Erzeugt einen Setter, der nur die `users` einer Seite ersetzt – für
 * optimistische Änderungen einzelner Zeilen, ohne die Zählerstände
 * anzufassen.
 */
function patchUsers(setData) {
  return (updater) =>
    setData((prev) => ({
      ...prev,
      users: typeof updater === 'function' ? updater(prev.users) : updater,
    }));
}

/**
 * Kennzahlen des gesamten Vereins (`GET /api/admin/users/stats`).
 *
 * Bewusst getrennt von der Liste: die Zahlen im Kopf sollen sich nicht
 * ändern, nur weil gerade ein Filter aktiv ist.
 */
export function useMemberStats(refreshKey = 0) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/admin/users/stats');
        if (!cancelled) setStats(data?.stats ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { stats, error };
}
