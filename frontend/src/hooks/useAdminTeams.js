import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Mannschaften der Verwaltung (`GET /api/admin/teams`) – wie die öffentliche
 * Liste, zusätzlich mit den Mitgliederzahlen je Mannschaft und den
 * Stammdaten (Altersklasse, Geschlecht, nuLiga-Nummer).
 */
export function useAdminTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initiales Laden – setState erst nach dem await, um Kaskaden-Renders zu
  // vermeiden; `cancelled` verhindert Updates auf unmounteten Komponenten.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch('/api/admin/teams');
        if (!cancelled) setTeams(data?.teams ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Serverstand neu holen (nach dem Anlegen einer Mannschaft). */
  const reload = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/teams');
      setTeams(data?.teams ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { teams, loading, error, setError, reload };
}
