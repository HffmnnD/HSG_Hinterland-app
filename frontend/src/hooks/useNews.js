import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Lädt die Vereins-News (`GET /api/news`, nur für angemeldete Mitglieder).
 *
 * @param {{ limit?: number }} [opts] Höchstzahl der Beiträge (Dashboard-Feed).
 * @returns {{ news: object[], loading: boolean, error: string|null,
 *             reload: () => Promise<void> }}
 *   `reload` holt den Serverstand neu – nach dem Anlegen oder Löschen eines
 *   Beitrags in der Verwaltung.
 */
export function useNews({ limit } = {}) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const path = limit ? `/api/news?limit=${limit}` : '/api/news';

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch(path);
      setNews(data?.news ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [path]);

  // Initiales Laden – setState erst nach dem await, um Kaskaden-Renders zu
  // vermeiden; `cancelled` verhindert Updates auf unmounteten Komponenten.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch(path);
        if (!cancelled) setNews(data?.news ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { news, loading, error, reload };
}
