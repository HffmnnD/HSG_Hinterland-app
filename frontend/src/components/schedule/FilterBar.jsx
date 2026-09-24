import { CalendarRange, History, Users } from 'lucide-react';

import { EVENT_CATEGORIES } from '../../lib/schedule';

/**
 * Filterleiste über der Terminliste: Mannschaft, Terminart, Rückblick.
 *
 * ── Warum das umgebaut wurde ────────────────────────────────────────────────
 * Vorher standen hier zwei Reihen gleich aussehender Chips, dazu ein dritter
 * Chip für den Rückblick, der genauso aussah, aber etwas völlig anderes tat:
 * Er verschob den Zeitraum, statt zu filtern. Bei mehreren Mannschaften waren
 * das bis zu zwölf identische Knöpfe, und keiner sagte, WAS er einschränkt.
 *
 * Jetzt ist es EINE Karte mit drei benannten Feldern:
 *
 *   Mannschaft   „Alle meine Teams" oder eine bestimmte – als Auswahlfeld,
 *                weil die Zahl der Mannschaften offen ist und Kürzel wie
 *                „MJC" ohne Namen niemandem helfen. Bei nur einer Mannschaft
 *                fällt das Feld weg.
 *   Terminart    Alles / Training / Spiele / Sonstiges – vier feste
 *                Möglichkeiten, also ein Segmentumschalter: alle Antworten
 *                sind gleichzeitig sichtbar, ein Klick genügt.
 *   Zeitraum     Der Rückblick ist ein Schalter und steht abgesetzt, weil er
 *                den Zeitraum ändert und nicht die Auswahl einschränkt.
 *
 * Alle drei Werte hält die Seite (CalendarPage) – die Leiste ist bewusst ohne
 * eigenen Zustand, damit es nur eine Wahrheit gibt.
 *
 * @param {{ teams: {id:number, name:string, code:string}[],
 *           teamId: number|null,
 *           onTeamChange: (id:number|null) => void,
 *           category: string|null,
 *           onCategoryChange: (key:string|null) => void,
 *           lookback: boolean,
 *           onLookbackChange: (value:boolean) => void,
 *           lookbackDays: number }} props
 */
export default function FilterBar({
  teams,
  teamId,
  onTeamChange,
  category,
  onCategoryChange,
  lookback,
  onLookbackChange,
  lookbackDays,
}) {
  const categories = [{ key: null, label: 'Alles' }, ...EVENT_CATEGORIES];

  return (
    <section
      aria-label="Termine filtern"
      className="rounded-md border border-line bg-paper p-3 shadow-card sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {/* ------------------------------------------------- Mannschaft */}
        {teams.length > 1 && (
          <div className="min-w-0 lg:w-64">
            <label htmlFor="filter-team" className="eyebrow mb-1.5 flex items-center gap-1.5">
              <Users size={12} aria-hidden="true" />
              Mannschaft
            </label>
            <select
              id="filter-team"
              value={teamId ?? ''}
              onChange={(event) =>
                onTeamChange(event.target.value ? Number(event.target.value) : null)
              }
              className="field-control"
            >
              <option value="">Alle meine Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ------------------------------------------------- Terminart */}
        <div className="min-w-0 flex-1">
          <span className="eyebrow mb-1.5 flex items-center gap-1.5">
            <CalendarRange size={12} aria-hidden="true" />
            Terminart
          </span>
          <div
            role="group"
            aria-label="Terminart"
            className="flex rounded-md border border-line bg-surface p-1"
          >
            {categories.map((entry) => {
              const active = category === entry.key;
              return (
                <button
                  key={entry.key ?? 'all'}
                  type="button"
                  onClick={() => onCategoryChange(entry.key)}
                  aria-pressed={active}
                  className={`min-h-9 flex-1 rounded px-2 font-display text-xs font-semibold uppercase tracking-[0.05em] transition-colors ${
                    active
                      ? 'bg-hsg-green text-white'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* --------------------------------------------------- Zeitraum */}
        <div className="shrink-0">
          <span className="eyebrow mb-1.5 flex items-center gap-1.5">
            <History size={12} aria-hidden="true" />
            Zeitraum
          </span>
          <button
            type="button"
            onClick={() => onLookbackChange(!lookback)}
            aria-pressed={lookback}
            className={`chip w-full justify-center lg:w-auto ${
              lookback ? 'chip-active' : ''
            }`}
            title={
              lookback
                ? 'Nur noch anstehende Termine zeigen'
                : `Auch die letzten ${lookbackDays} Tage zeigen`
            }
          >
            {lookback ? `Mit Rückblick (${lookbackDays} Tage)` : 'Nur anstehende'}
          </button>
        </div>
      </div>
    </section>
  );
}
