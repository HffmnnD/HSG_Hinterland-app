import { Baby, Link2, Plus, Trash2 } from 'lucide-react';

import TeamChoice from './TeamChoice';

let keyCounter = 0;
const newKey = () => `kind-${Date.now()}-${(keyCounter += 1)}`;

/**
 * Onboarding-Schritt „Deine Kinder" für Eltern.
 *
 * Je Kind entweder ein neues Kinderprofil (Name + Mannschaften) oder – wenn
 * das Kind schon ein eigenes Konto hat – dessen Familiencode. Gespeichert
 * wird erst beim Abschluss des Assistenten (siehe OnboardingWizard).
 *
 * @param {{ entries: object[], onChange: (entries:object[]) => void,
 *           teams: object[], defaultLastName: string }} props
 */
export default function ChildrenStep({ entries, onChange, teams, defaultLastName }) {
  const update = (index, patch) => onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const remove = (index) => onChange(entries.filter((_, i) => i !== index));
  const add = (kind) =>
    onChange([
      ...entries,
      kind === 'new'
        ? { kind, key: newKey(), firstName: '', lastName: defaultLastName, teamIds: [] }
        : { kind, key: newKey(), code: '' },
    ]);

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-ink-soft">
        Du kannst für deine Kinder zu- und absagen, Abwesenheiten eintragen und bekommst ihre Benachrichtigungen. Oben
        rechts wechselst du jederzeit zwischen dir und jedem Kind.
      </p>

      {entries.map((entry, index) => (
        <div key={entry.key} className="space-y-3 rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-display text-sm font-bold tracking-[-0.01em] text-ink">
              {entry.kind === 'new' ? <Baby size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              {entry.kind === 'new' ? `Kind ${index + 1}` : `Kind ${index + 1} – hat schon ein Konto`}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => remove(index)}
              aria-label={`Kind ${index + 1} entfernen`}
              disabled={entry.done}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>

          {entry.done ? (
            <p className="text-sm text-ink-soft">Gespeichert.</p>
          ) : entry.kind === 'new' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="field-control"
                  placeholder="Vorname"
                  aria-label={`Vorname Kind ${index + 1}`}
                  maxLength={100}
                  value={entry.firstName}
                  onChange={(e) => update(index, { firstName: e.target.value })}
                />
                <input
                  className="field-control"
                  placeholder="Nachname"
                  aria-label={`Nachname Kind ${index + 1}`}
                  maxLength={100}
                  value={entry.lastName}
                  onChange={(e) => update(index, { lastName: e.target.value })}
                />
              </div>
              <div>
                <h3 className="field-label">In welcher Mannschaft spielt {entry.firstName || 'dein Kind'}?</h3>
                <TeamChoice
                  teams={teams}
                  selectedIds={entry.teamIds}
                  onToggle={(teamId) =>
                    update(index, {
                      teamIds: entry.teamIds.includes(teamId)
                        ? entry.teamIds.filter((id) => id !== teamId)
                        : [...entry.teamIds, teamId],
                    })
                  }
                  idPrefix={`onboarding-child-${entry.key}`}
                />
              </div>
            </>
          ) : (
            <>
              <input
                className="field-control font-mono uppercase tracking-widest"
                placeholder="Code, z. B. AB12-CD34"
                aria-label={`Familiencode Kind ${index + 1}`}
                maxLength={12}
                autoComplete="off"
                value={entry.code}
                onChange={(e) => update(index, { code: e.target.value })}
              />
              <p className="field-hint">
                Den Code erzeugt dein Kind in seinem Konto unter „Mein Konto → Familie".
              </p>
            </>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => add('new')}>
          <Plus size={14} aria-hidden="true" /> Kind hinzufügen
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => add('code')}>
          <Link2 size={14} aria-hidden="true" /> Kind hat schon ein Konto
        </button>
      </div>
      <p className="field-hint">
        Später kann dein Kind mit einem Code aus deinem Konto ein eigenes Login bekommen – sein Profil bleibt dabei
        erhalten.
      </p>
    </div>
  );
}
