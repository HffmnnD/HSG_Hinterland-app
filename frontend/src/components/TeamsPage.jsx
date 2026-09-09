import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import AppLayout from './AppLayout';
import MyTeams from './MyTeams';

/**
 * Übersicht aller Mannschaften (`/teams`) – Einstiegspunkt des Reiters
 * „Teams". Oben die eigenen Zuordnungen, darunter der komplette Verein.
 */
export default function TeamsPage() {
  const { teams: myTeams } = useAuth();
  const { teams: allTeams, loading, error } = useTeams();

  // Mannschaften, in denen das Mitglied selbst eingetragen ist – für die
  // Markierung in der Gesamtliste.
  const myTeamIds = new Set(myTeams.map((team) => team.id));

  return (
    <AppLayout width="max-w-3xl">
      <h1 className="page-title">Mannschaften</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Deine Zuordnungen und alle Mannschaften der HSG Hinterland.
      </p>

      <section className="mt-6">
        <h2 className="section-title">Meine Mannschaften</h2>
        <div className="card mt-3">
          <MyTeams
            teams={myTeams}
            emptyHint="Du bist noch keiner Mannschaft zugeordnet. Wähle unten eine Mannschaft aus, um ihren Kader zu sehen."
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="section-title">Alle Mannschaften</h2>

        {error && (
          <div role="alert" className="alert alert-error mt-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-3 text-sm text-ink-muted">
            Mannschaften werden geladen …
          </p>
        ) : allTeams.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Keine Mannschaften hinterlegt.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {allTeams.map((team) => (
              <li key={team.id}>
                <Link
                  to={`/teams/${team.code}`}
                  className="card flex min-h-16 items-center gap-3 transition-colors hover:border-hsg-green"
                >
                  <span className="badge badge-trainer shrink-0">
                    {team.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-base font-bold uppercase tracking-[0.02em] text-ink">
                    {team.name}
                  </span>
                  {myTeamIds.has(team.id) && (
                    <span className="badge badge-neutral shrink-0">dabei</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}
