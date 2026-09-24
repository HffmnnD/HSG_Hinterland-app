import { useEffect, useState } from 'react';

import { apiFetch } from '../lib/api';

/**
 * Lädt die Liste aller Mannschaften (`GET /api/teams`, Anmeldung nötig).
 * Genutzt vom Onboarding-Assistenten, der Mannschaftsübersicht, „Mein Konto"
 * und der Mitgliederverwaltung – alle vier hinter dem Login.
 */
export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch('/api/teams');
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

  return { teams, loading, error };
}
