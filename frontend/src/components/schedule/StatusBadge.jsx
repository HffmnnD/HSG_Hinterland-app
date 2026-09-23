import { sourceHint, statusPresentation } from '../../lib/schedule';

/**
 * Anwesenheits-Status als farbiger Chip.
 *
 *   Grün = dabei · Rot = abgesagt · Gelb = Urlaub/Verletzung
 *
 * @param {{ status: 'ATTENDING'|'DECLINED',
 *           source?: 'DEFAULT'|'SELF'|'COACH'|'ABSENCE',
 *           withHint?: boolean }} props
 *   `withHint` ergänzt die Herkunft („vom Trainerteam eingetragen").
 */
export default function StatusBadge({ status, source, withHint = false }) {
  const view = statusPresentation(status, source);
  const hint = withHint ? sourceHint(source) : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`badge ${view.badge}`}>{view.label}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </span>
  );
}

/**
 * Zusammenfassung „12 dabei · 2 fehlen" mit farbigen Punkten.
 *
 * @param {{ counts: {attending:number, declined:number, rosterSize:number} }} props
 */
export function AttendanceCounts({ counts }) {
  if (!counts || counts.rosterSize === 0) {
    return (
      <span className="text-xs text-ink-muted">
        Für diese Mannschaft ist noch kein Kader bestätigt.
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="status">
        <span className="status-dot bg-hsg-green" aria-hidden="true" />
        <span className="text-ink">{counts.attending} dabei</span>
      </span>
      <span className="status">
        <span className="status-dot bg-danger" aria-hidden="true" />
        <span className={counts.declined > 0 ? 'text-ink' : 'text-ink-muted'}>
          {counts.declined} fehlen
        </span>
      </span>
    </span>
  );
}
