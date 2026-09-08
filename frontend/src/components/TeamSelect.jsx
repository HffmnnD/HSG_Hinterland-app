/**
 * Mehrfachauswahl von Mannschaften als Toggle-Chips (mobil-freundlich).
 *
 * Gibt beim Klick nur die betroffene Team-ID zurück (`onToggle`). Die
 * aufrufende Komponente wendet die Änderung per funktionalem State-Update an –
 * so gehen auch schnelle aufeinanderfolgende Klicks nicht verloren.
 *
 * @param {{id:number, code:string, name:string}[]} teams  Alle verfügbaren Teams
 * @param {number[]} selectedIds                           Aktuell gewählte IDs
 * @param {(teamId:number) => void} onToggle               Klick auf einen Chip
 * @param {boolean} [disabled]
 * @param {'sm'|'md'} [size]
 */
export default function TeamSelect({
  teams,
  selectedIds,
  onToggle,
  disabled = false,
  size = 'md',
}) {
  if (teams.length === 0) {
    return (
      <p className="text-xs text-ink-muted">Keine Mannschaften verfügbar.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {teams.map((team) => {
        const active = selectedIds.includes(team.id);
        return (
          <button
            key={team.id}
            type="button"
            role="checkbox"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onToggle(team.id)}
            title={team.name}
            className={`chip ${size === 'sm' ? 'chip-sm' : ''} ${
              active ? 'chip-active' : ''
            }`}
          >
            {team.code}
          </button>
        );
      })}
    </div>
  );
}
