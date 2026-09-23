import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';

// Wie oft der Status von selbst nachgeladen wird. 15 Sekunden sind für ein
// Monitoring flüssig genug und belasten den Server praktisch nicht (der
// Endpunkt liest nur Zähler aus dem Speicher plus ein `SELECT 1`).
const REFRESH_MS = 15000;

/**
 * System-Status (`GET /api/admin/system`) mit automatischer Aktualisierung.
 *
 * Drei Dinge, die ein Auto-Refresh richtig machen muss:
 *
 *   * Beim Nachladen NICHT auf „lädt" zurückfallen – sonst blinkt das
 *     Dashboard alle 15 Sekunden weiß. `loading` ist deshalb nur beim ersten
 *     Abruf wahr; danach wird der alte Stand stehen gelassen und ersetzt.
 *   * Pausieren, sobald der Reiter im Hintergrund liegt. Ein Handy, das
 *     nachts in der Tasche steckt, soll nicht stündlich 240 Requests stellen.
 *   * Späte Antworten verwerfen: ein langsamer Abruf darf einen neueren nicht
 *     überschreiben (`requestId`).
 */
export function useSystemStatus({ autoRefresh = true } = {}) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const requestId = useRef(0);

  /** Nachladen ohne Ladezustand – für Timer, Sichtbarkeitswechsel und Knopf. */
  const reload = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;

    setRefreshing(true);
    try {
      const data = await apiFetch('/api/admin/system');
      if (id !== requestId.current) return;
      setStatus(data);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  // Erster Abruf. setState liegt hinter dem await, löst also keine
  // Kaskaden-Renderrunde aus.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const id = requestId.current + 1;
      requestId.current = id;
      try {
        const data = await apiFetch('/api/admin/system');
        if (!cancelled && id === requestId.current) setStatus(data);
      } catch (err) {
        if (!cancelled && id === requestId.current) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    const timer = setInterval(() => {
      // `hidden` ist true, sobald der Reiter oder die App im Hintergrund ist.
      if (!document.hidden) reload();
    }, REFRESH_MS);

    // Beim Zurückkommen sofort auffrischen, statt bis zum nächsten Takt einen
    // veralteten Stand zu zeigen.
    const onVisible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoRefresh, reload]);

  return {
    status,
    loading,
    refreshing,
    error,
    setError,
    reload,
    refreshSeconds: REFRESH_MS / 1000,
  };
}
