import { parseEventTime } from '../../lib/schedule';
import EventCard from './EventCard';

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** Termine nach Monat gruppieren – die Liste läuft über viele Wochen. */
function groupByMonth(events) {
  const groups = [];
  for (const event of events) {
    const date = parseEventTime(event.startTime);
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'unbekannt';
    const label = date
      ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
      : 'Ohne Datum';

    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, label, events: [event] });
  }
  return groups;
}

/**
 * Terminliste, nach Datum sortiert und nach Monat gruppiert.
 *
 * @param {{ events: object[], viewerId: number, showTeam?: boolean,
 *           loading?: boolean, busy?: boolean, emptyHint?: string,
 *           onRespond: Function, onEdit?: Function, onDelete?: Function }} props
 */
export default function UpcomingPanel({
  events,
  viewerId,
  showTeam = false,
  loading = false,
  busy = false,
  emptyHint,
  onRespond,
  onEdit,
  onDelete,
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <span className="skeleton h-28 w-full" />
        <span className="skeleton h-28 w-full" />
        <span className="skeleton h-28 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="card-note">
        {emptyHint ??
          'In diesem Zeitraum stehen keine Termine an. Sobald das Trainerteam Trainingszeiten einträgt, erscheinen sie hier.'}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {groupByMonth(events).map((group) => (
        <section key={group.key}>
          <h2 className="eyebrow">{group.label}</h2>
          <div className="mt-2 space-y-3">
            {group.events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                viewerId={viewerId}
                showTeam={showTeam}
                busy={busy}
                onRespond={onRespond}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
