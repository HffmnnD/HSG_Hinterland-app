import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';

import {
  dateParts,
  eventTypeLabel,
  formatClock,
  isRunning,
} from '../../lib/schedule';

// Mehr als vier Termine sind keine „Schnellzugriffe" mehr, sondern eine
// Terminliste – und die steht im Kalender.
const MAX_ENTRIES = 4;

/**
 * „Als Nächstes": die nächsten Trainings und Spiele der eigenen Mannschaften.
 *
 * Bewusst eine verkürzte Ansicht ohne Zu-/Absage-Knöpfe: Hier geht es um die
 * Frage „was steht an?", nicht um „bin ich dabei?". Jeder Eintrag führt in den
 * Kalender, wo die Rückmeldung hingehört – so gibt es für dieselbe Handlung
 * nicht zwei Orte mit womöglich unterschiedlichem Stand.
 *
 * @param {{ events: object[], loading?: boolean, error?: string|null,
 *           hasTeams: boolean }} props
 */
export default function NextUpPanel({ events, loading = false, error, hasTeams }) {
  const upcoming = events.slice(0, MAX_ENTRIES);

  return (
    <section className="panel">
      <div className="panel__header">
        <h2 className="section-title flex items-center gap-2 text-base">
          <CalendarDays size={16} aria-hidden="true" className="text-ink-muted" />
          Als Nächstes
        </h2>
        <Link to="/kalender" className="link text-sm">
          Kalender
        </Link>
      </div>

      <div className="panel__body">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : loading ? (
          <ul className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <li key={row} className="skeleton h-14 w-full" />
            ))}
          </ul>
        ) : !hasTeams ? (
          <p className="text-sm text-ink-muted">
            Sobald du einer Mannschaft als Spieler:in oder Trainer:in
            zugeordnet bist, stehen hier die nächsten Trainings und Spiele.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-ink-muted">
            In den nächsten Wochen ist nichts eingetragen.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <li key={event.id}>
                <EventRow event={event} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Eine Zeile: Datumsblock, Titel mit Mannschaft, Uhrzeit und Ort. */
function EventRow({ event }) {
  const { weekday, day, month } = dateParts(event.startTime);
  const cancelled = Boolean(event.cancelledAt);
  const running = !cancelled && isRunning(event.startTime, event.endTime);

  return (
    <Link
      to="/kalender"
      className="flex items-center gap-3 rounded-md border border-line bg-paper p-2.5 transition-colors hover:border-hsg-green"
    >
      <span className="event-date">
        <span className="event-date__weekday">{weekday}</span>
        <span className="event-date__day">{day}</span>
        <span className="event-date__month">{month}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-bold text-ink">{event.title}</span>
          {cancelled && <span className="badge badge-declined">Abgesagt</span>}
          {running && <span className="badge badge-live">Läuft</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {[event.teamName, eventTypeLabel(event.type), formatClock(event.startTime)]
            .filter(Boolean)
            .join(' · ')}
          {' Uhr'}
        </span>
        {event.location && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
            <MapPin size={11} aria-hidden="true" className="shrink-0" />
            {event.location}
          </span>
        )}
      </span>
    </Link>
  );
}
