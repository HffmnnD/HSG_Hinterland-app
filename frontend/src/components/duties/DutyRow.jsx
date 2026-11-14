import { formatClock } from '../../lib/schedule';
import { freeSlots, slotsLabel } from '../../lib/duties';
import Avatar from '../ui/Avatar';

/**
 * Ein Dienst in der Liste: Zeit, Titel, Belegung, wer dabei ist, und genau
 * ein Knopf – Übernehmen oder nichts. Austragen geht nur über die Vereinsleitung.
 *
 * @param {{ duty: object, busy?: boolean, note?: {tone:'error'|'success', text:string}|null,
 *           onClaim: (duty:object) => void }} props
 */
export default function DutyRow({ duty, busy = false, note = null, onClaim }) {
  const full = freeSlots(duty) === 0;
  const clock = `${formatClock(duty.startTime)}–${formatClock(duty.endTime)}`;
  // Titel aus der Vorlage tragen die Uhrzeit schon („Kuchenverkauf 10:00–11:30").
  const timeInTitle = duty.title.includes(clock);

  let action = null;
  if (duty.mine) {
    action = null;
  } else if (!duty.started && !full && duty.canTake) {
    action = (
      <button
        type="button"
        disabled={busy}
        onClick={() => onClaim(duty)}
        className="btn btn-sm btn-primary"
      >
        {busy ? '…' : 'Übernehmen'}
      </button>
    );
  } else if (full && !duty.started) {
    action = <span className="badge badge-neutral">Vergeben</span>;
  }

  return (
    <li
      id={`duty-${duty.id}`}
      className={`scroll-mt-24 rounded-md border p-3 ${
        duty.mine ? 'border-hsg-green bg-hsg-green-soft' : 'border-line bg-paper'
      } ${duty.started ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          {!timeInTitle && (
            <p className="text-sm text-ink-muted">
              {formatClock(duty.startTime)} – {formatClock(duty.endTime)} Uhr
            </p>
          )}
          <p className="mt-0.5 font-display text-sm font-bold tracking-[-0.01em] text-ink">
            {duty.title}
          </p>
        </div>

        <span
          className={`shrink-0 self-center text-sm font-semibold ${
            full ? 'text-ink-muted' : 'text-hsg-green-dark'
          }`}
        >
          {slotsLabel(duty)}
        </span>
        {action && <span className="shrink-0 self-center">{action}</span>}
      </div>

      {duty.assignees.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {duty.assignees.map((person) => (
            <li key={person.id} className="flex items-center gap-1.5 text-sm text-ink-soft">
              <Avatar person={person} size="xs" />
              {person.firstName} {person.lastName}
            </li>
          ))}
        </ul>
      )}

      {duty.mine && !duty.started && (
        <p className="mt-2 text-xs text-ink-muted">
          Austragen nur über die Vereinsleitung
        </p>
      )}

      {note && (
        <p
          role={note.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-sm font-semibold ${
            note.tone === 'error' ? 'text-danger' : 'text-hsg-green-dark'
          }`}
        >
          {note.text}
        </p>
      )}
    </li>
  );
}
