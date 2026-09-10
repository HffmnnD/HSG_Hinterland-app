import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

const EMPTY_COUNTS = { active: 0, archived: 0 };

/**
 * Beiträge der Verwaltungssicht (`GET /api/admin/news`).
 *
 * Anders als `useNews` (Feed) kennt dieser Hook das Archiv und liefert immer
 * die Zählerstände beider Stapel mit – sie stehen an den Umschaltern, auch
 * wenn gerade der andere Stapel angezeigt wird.
 *
 * `loading` wird ABGELEITET, nicht gesetzt: der Zustand merkt sich, zu welchem
 * Stapel die angezeigten Daten gehören (`key`). Stimmt der nicht mit dem
 * angeforderten überein, wird noch geladen. Das erspart ein `setLoading(true)`
 * im Effekt (das eine zusätzliche Renderrunde auslöst) und zeigt beim
 * Umschalten trotzdem sofort den Ladezustand statt kurz der falschen Liste.
 *
 * @param {'active'|'archived'|'all'} status
 */
export function useAdminNews(status = 'active') {
  const [result, setResult] = useState({
    key: null,
    news: [],
    counts: EMPTY_COUNTS,
    error: null,
  });

  const fetchNews = useCallback(async (wanted) => {
    try {
      const data = await apiFetch(`/api/admin/news?status=${wanted}`);
      return {
        key: wanted,
        news: data?.news ?? [],
        counts: data?.counts ?? EMPTY_COUNTS,
        error: null,
      };
    } catch (err) {
      // Der Stapel gilt trotzdem als „geladen“ – sonst dreht sich der
      // Ladehinweis nach einem Fehler ewig weiter.
      return { key: wanted, news: [], counts: EMPTY_COUNTS, error: err.message };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchNews(status);
      if (!cancelled) setResult(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, fetchNews]);

  /** Serverstand neu holen, ohne den Ladehinweis zu zeigen. */
  const reload = useCallback(async () => {
    setResult(await fetchNews(status));
  }, [fetchNews, status]);

  const setError = useCallback((message) => {
    setResult((prev) => ({ ...prev, error: message }));
  }, []);

  return {
    news: result.news,
    counts: result.counts,
    error: result.error,
    loading: result.key !== status,
    setError,
    reload,
  };
}
