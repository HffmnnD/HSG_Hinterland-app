import { Link } from 'react-router-dom';
import { ChevronRight, Trophy, Users } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { groupTeams, teamMeta } from '../lib/teams';
import AppLayout from './AppLayout';
import MyTeams from './MyTeams';

/**
 * Übersicht aller Mannschaften (`/teams`) – Einstiegspunkt des Reiters „Teams".
 *
 * ── Warum das Raster neu gebaut wurde ───────────────────────────────────────
 * Vorher war es eine flache Liste gleich aussehender Karten: Kürzel-Badge,
 * Name, fertig. Bei einem Verein mit Jugend und Erwachsenen sagt diese Liste
 * nichts darüber, was man vor sich hat – „MJC" und „H1" stehen gleichwertig
 * untereinander, und ob eine Mannschaft männlich, weiblich oder gemischt
 * spielt, war überhaupt nicht zu sehen.
 *
 * Jetzt sind es Abschnitte (Senioren / Jugend) mit Karten, die Altersklasse und
 * Geschlecht mitbringen. Die Einteilung leitet lib/teams.js aus den Feldern der
 * Verwaltung ab – es gibt bewusst kein zusätzliches Feld, das jemand pflegen
 * müsste.
 *
 * Fan- oder Anhängerzahlen kommen hier NICHT vor: Die Zuordnung „Fan" steuert
 * nur, wessen Spieltermine jemand angezeigt bekommt, und ist keine Kennzahl
 * einer Mannschaft.
 */
export default function TeamsPage() {
  const { teams: myTeams } = useAuth();
  const { teams: allTeams, loading, error } = useTeams();

  // Mannschaften, in denen das Mitglied selbst eingetragen ist – für die
  // Markierung in der Gesamtliste.
  const myTeamIds = new Set(myTeams.map((team) => team.id));
  const groups = groupTeams(allTeams);

  return (
    <AppLayout width="max-w-4xl">
      <header>
        <h1 className="page-title">Mannschaften</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Deine Zuordnungen und alle Mannschaften der HSG Hinterland.
        </p>
      </header>

      <section className="panel mt-6">
        <div className="panel__header">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Users size={16} aria-hidden="true" className="text-ink-muted" />
            Meine Mannschaften
          </h2>
          <span className="eyebrow">
            {myTeams.length === 1
              ? '1 Zuordnung'
              : `${myTeams.length} Zuordnungen`}
          </span>
        </div>
        <div className="panel__body">
          <MyTeams
            teams={myTeams}
            emptyHint="Du bist noch keiner Mannschaft zugeordnet. Wähle unten eine Mannschaft aus, um ihren Kader zu sehen – oder ordne dich unter „Mein Konto“ selbst zu."
          />
        </div>
      </section>

      <section className="panel mt-5">
        <div className="panel__header">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Trophy size={16} aria-hidden="true" className="text-ink-muted" />
            Alle Mannschaften
          </h2>
          {!loading && allTeams.length > 0 && (
            <span className="eyebrow">
              {allTeams.length === 1
                ? '1 Mannschaft'
                : `${allTeams.length} Mannschaften`}
            </span>
          )}
        </div>

        <div className="panel__body">
          {error && (
            <div role="alert" className="alert alert-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
              {[0, 1, 2, 3].map((row) => (
                <span key={row} className="skeleton h-20 w-full" />
              ))}
            </div>
          ) : allTeams.length === 0 ? (
            <p className="card-note">Keine Mannschaften hinterlegt.</p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="eyebrow">{group.label}</h3>
                    <p className="text-xs text-ink-muted">{group.hint}</p>
                  </div>

                  <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                    {group.teams.map((team) => (
                      <li key={team.id}>
                        <TeamCard
                          team={team}
                          isMine={myTeamIds.has(team.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppLayout>
  );
}

/**
 * Eine Mannschaftskarte: Kürzel, Name, Altersklasse und Geschlecht.
 *
 * Das Foto der Mannschaft bleibt bewusst weg. Im Raster wäre es entweder
 * briefmarkengroß (und damit nutzlos) oder es würde die Karte dominieren –
 * und Mannschaften ohne Foto sähen in derselben Liste kaputt aus.
 */
function TeamCard({ team, isMine }) {
  const meta = teamMeta(team);

  return (
    <Link
      to={`/teams/${team.code}`}
      className="flex min-h-20 items-center gap-3 rounded-md border border-line bg-paper p-3.5 shadow-card transition-colors hover:border-hsg-green"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-hsg-green-soft font-display text-sm font-bold uppercase leading-none tracking-[0.02em] text-hsg-green-darker"
      >
        {team.code}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-display text-base font-bold uppercase tracking-[0.02em] text-ink">
            {team.name}
          </span>
          {isMine && <span className="badge badge-confirmed">dabei</span>}
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {meta}
          </span>
        )}
        {team.handballTeamId && (
          <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            <span className="status-dot bg-hsg-green" aria-hidden="true" />
            Im Spielbetrieb
          </span>
        )}
      </span>

      <ChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-ink-muted"
      />
    </Link>
  );
}
