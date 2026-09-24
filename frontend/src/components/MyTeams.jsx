import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { myRelationLabel } from '../lib/participation';

// Trainer:innen zuerst, dann Spieler:innen, dann die verfolgten Mannschaften.
const RELATION_ORDER = ['coach', 'player', 'fan'];

/**
 * Die Mannschaften des angemeldeten Mitglieds, gruppiert nach der eigenen
 * Rolle. Jede Karte führt auf die Mannschaftsseite; noch nicht bestätigte
 * Zuordnungen sind bernsteinfarben gekennzeichnet.
 *
 * Wird auf der Startseite und auf der Mannschaftsübersicht verwendet – deshalb
 * liefert die Komponente nur die Liste und keine Umrandung: Die Überschrift und
 * die Karte drumherum gibt die jeweilige Seite vor.
 *
 * @param {{ teams: {id:number, code:string, name:string,
 *                   relationType:string, isConfirmed:boolean}[],
 *           emptyHint?: string }} props
 */
export default function MyTeams({ teams, emptyHint }) {
  const groups = RELATION_ORDER.map((relation) => ({
    relation,
    entries: teams.filter((team) => team.relationType === relation),
  })).filter((group) => group.entries.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        {emptyHint ?? 'Noch keiner Mannschaft zugeordnet.'}
      </p>
    );
  }

  const hasPending = groups.some((group) =>
    group.entries.some((team) => !team.isConfirmed)
  );

  return (
    <div className="space-y-4">
      {groups.map(({ relation, entries }) => (
        <div key={relation}>
          <p className="eyebrow">{myRelationLabel(relation)}</p>
          <ul className="mt-2 space-y-2">
            {entries.map((team) => (
              <li key={`${relation}-${team.id}`}>
                <Link
                  to={`/teams/${team.code}`}
                  className={`flex min-h-12 items-center gap-3 rounded-md border bg-paper px-3 py-2 transition-colors hover:border-hsg-green ${
                    team.isConfirmed ? 'border-line' : 'border-warn-line'
                  }`}
                >
                  <span
                    className={`badge shrink-0 ${
                      team.isConfirmed ? 'badge-trainer' : 'badge-pending'
                    }`}
                  >
                    {team.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-sm font-bold uppercase tracking-[0.02em] text-ink">
                    {team.name}
                  </span>
                  {!team.isConfirmed && (
                    <span className="badge badge-pending shrink-0">
                      ausstehend
                    </span>
                  )}
                  <ChevronRight
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 text-ink-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hasPending && (
        <p className="text-xs text-warn">
          „Ausstehend" bedeutet: der/die Trainer:in muss deine Mitgliedschaft
          noch bestätigen.
        </p>
      )}
    </div>
  );
}
