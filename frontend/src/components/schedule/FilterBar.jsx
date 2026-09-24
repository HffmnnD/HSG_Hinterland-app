import { CalendarRange, History, Users } from 'lucide-react';

import { EVENT_CATEGORIES } from '../../lib/schedule';

/**
 * Filterleiste über der Terminliste: Mannschaft, Terminart, Zeitraum.
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
 *   Zeitraum     Nur anstehende / Rückblick / eigener Zeitraum. Der eigene
 *                Zeitraum klappt zwei Datumsfelder auf – für „was war
 *                eigentlich im September?" oder die Planung der Hinrunde.
 *
 * Alle Werte hält die Seite (CalendarPage) – die Leiste ist bewusst ohne
 * eigenen Zustand, damit es nur eine Wahrheit gibt.
 *
 * @param {{ teams: {id:number, name:string, code:string}[],
 *           teamId: number|null,
 *           onTeamChange: (id:number|null) => void,
 *           category: string|null,
 *           onCategoryChange: (key:string|null) => void,
 *           rangeMode: 'upcoming'|'lookback'|'custom',
 *           onRangeModeChange: (mode:string) => void,
 *           range: { from:string, to:string },
 *           onRangeChange: (range:{from:string, to:string}) => void,
 *           lookbackDays: number }} props
 */
export default function FilterBar({
  teams,
  teamId,
  onTeamChange,
  category,
  onCategoryChange,
  rangeMode,
  onRangeModeChange,
  range,
  onRangeChange,
  lookbackDays,
}) {
  const categories = [{ key: null, label: 'Alles' }, ...EVENT_CATEGORIES];

  const RANGE_MODES = [
    { key: 'upcoming', label: 'Nur anstehende' },
    { key: 'lookback', label: `Rückblick ${lookbackDays} Tage` },
    { key: 'custom', label: 'Eigener Zeitraum' },
  ];

  // Ein Zeitraum, dessen Ende vor seinem Anfang liegt, ist ein Tippfehler –
  // und würde eine leere Liste ohne Erklärung erzeugen.
  const invalidRange =
    rangeMode === 'custom' && range.from && range.to && range.from > range.to;

  return (
    <section
      aria-label="Termine filtern"
      className="rounded-md border border-line bg-paper p-3 shadow-card sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {/* ------------------------------------------------- Mannschaft */}
        {teams.length > 1 && (
          <div className="min-w-0 lg:w-56">
            <label
              htmlFor="filter-team"
              className="eyebrow mb-1.5 flex items-center gap-1.5"
            >
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
        <div className="min-w-0 lg:w-52">
          <label
            htmlFor="filter-range"
            className="eyebrow mb-1.5 flex items-center gap-1.5"
          >
            <History size={12} aria-hidden="true" />
            Zeitraum
          </label>
          <select
            id="filter-range"
            value={rangeMode}
            onChange={(event) => onRangeModeChange(event.target.value)}
            className="field-control"
          >
            {RANGE_MODES.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Eigener Zeitraum: erscheint erst, wenn er gewählt ist. Zwei
          Datumsfelder stünden sonst dauerhaft in der Leiste herum, obwohl sie
          die meiste Zeit niemand braucht. */}
      {rangeMode === 'custom' && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="filter-from" className="field-label">
              Von
            </label>
            <input
              id="filter-from"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(event) =>
                onRangeChange({ ...range, from: event.target.value })
              }
              className="field-control"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="filter-to" className="field-label">
              Bis
            </label>
            <input
              id="filter-to"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(event) =>
                onRangeChange({ ...range, to: event.target.value })
              }
              className="field-control"
            />
          </div>
        </div>
      )}

      {invalidRange && (
        <p role="alert" className="mt-2 text-xs text-danger">
          „Bis" liegt vor „Von" – bis dahin zeigt die Liste die anstehenden
          Termine.
        </p>
      )}
    </section>
  );
}
