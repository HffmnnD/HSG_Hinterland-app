import { Check } from 'lucide-react';

import { groupTeams, teamMeta } from '../../lib/teams';

/**
 * Mehrfachauswahl von Mannschaften als Karten, gruppiert nach Senioren und
 * Jugend.
 *
 * Bewusst nicht <TeamSelect> (Chips mit Kürzeln): Die Chips reichen in der
 * Verwaltung, wo man die Kürzel kennt. Beim ersten Einrichten kennt sie
 * niemand – dort braucht es den ausgeschriebenen Namen samt Altersklasse.
 *
 * @param {{ teams: object[], selectedIds: number[],
 *           onToggle: (teamId:number) => void, disabled?: boolean,
 *           idPrefix: string }} props
 */
export default function TeamChoice({
  teams,
  selectedIds,
  onToggle,
  disabled = false,
  idPrefix,
}) {
  if (teams.length === 0) {
    return (
      <p className="card-note">
        Für diesen Verein sind noch keine Mannschaften hinterlegt.
      </p>
    );
  }

  const groups = groupTeams(teams);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <fieldset key={group.key}>
          <legend className="eyebrow mb-2">{group.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.teams.map((team) => {
              const active = selectedIds.includes(team.id);
              const meta = teamMeta(team);
              return (
                <label
                  key={team.id}
                  htmlFor={`${idPrefix}-${team.id}`}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                    active
                      ? 'border-hsg-green bg-hsg-green-soft'
                      : 'border-line bg-paper hover:border-hsg-green'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {/* Echte Checkbox, nur unsichtbar: So funktionieren
                      Tastatur, Screenreader und das Anklicken der ganzen
                      Karte, ohne ARIA nachzubauen. */}
                  <input
                    id={`${idPrefix}-${team.id}`}
                    type="checkbox"
                    className="sr-only"
                    checked={active}
                    disabled={disabled}
                    onChange={() => onToggle(team.id)}
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                      active
                        ? 'border-hsg-green bg-hsg-green text-white'
                        : 'border-line-strong bg-paper'
                    }`}
                  >
                    {active && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-[0.02em] text-ink">
                      {team.name}
                    </span>
                    {meta && (
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {meta}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
