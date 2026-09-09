import { Link } from 'react-router-dom';

import { relationLabelPlural } from '../lib/participation';

// Trainer:innen zuerst, dann Spieler:innen, dann Fans.
const RELATION_ORDER = ['coach', 'player', 'fan'];

/**
 * Mannschaften des angemeldeten Mitglieds, nach Art der Beteiligung
 * gruppiert. Jeder Chip verlinkt auf die Mannschaftsseite; noch nicht
 * bestätigte Zuordnungen sind bernsteinfarben markiert.
 *
 * Wird sowohl auf dem Dashboard als auch auf der Mannschafts-Übersicht
 * verwendet.
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
          <p className="eyebrow">{relationLabelPlural(relation)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entries.map((team) => (
              <Link
                key={`${relation}-${team.id}`}
                to={`/teams/${team.code}`}
                title={
                  team.isConfirmed
                    ? team.name
                    : `${team.name} – wartet auf Bestätigung durch den/die Trainer:in`
                }
                className={`chip ${team.isConfirmed ? '' : 'chip-pending'}`}
              >
                {team.name}
                {!team.isConfirmed && (
                  <span className="badge badge-pending">ausstehend</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {hasPending && (
        <p className="text-xs text-warn">
          „Ausstehend“ bedeutet: der/die Trainer:in muss deine Mitgliedschaft
          noch bestätigen.
        </p>
      )}
    </div>
  );
}
