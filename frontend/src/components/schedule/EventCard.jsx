import { useState } from 'react';

import {
  dateParts,
  eventTypeLabel,
  formatTimeRange,
  isMultiDay,
  isPast,
  isRunning,
} from '../../lib/schedule';
import StatusBadge, { AttendanceCounts } from './StatusBadge';
import DeclineForm from './DeclineForm';
import EventAttendance from './EventAttendance';

/**
 * Ein Termin in der Liste.
 *
 * Enthält alles, was vor dem Training zählt: wann, wo, bin ich dabei, wer
 * fehlt. Die vollständige Kaderliste wird erst beim Aufklappen nachgeladen –
 * eine Terminliste mit 50 Einheiten soll nicht 50 Kader mitziehen.
 *
 * @param {{ event: object,
 *           viewerId: number,
 *           showTeam?: boolean,
 *           busy?: boolean,
 *           onRespond: (eventId:number, status:string, reason:string|null) => Promise<void>,
 *           onEdit?: (event:object) => void,
 *           onDelete?: (event:object) => void }} props
 */
export default function EventCard({
  event,
  viewerId,
  showTeam = false,
  busy = false,
  onRespond,
  onEdit,
  onDelete,
}) {
  const [declining, setDeclining] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { weekday, day, month } = dateParts(event.startTime);
  const past = isPast(event.endTime);
  const running = isRunning(event.startTime, event.endTime);
  const mine = event.myStatus;

  const handleAttend = async () => {
    await onRespond(event.id, 'ATTENDING', null);
    setDeclining(false);
  };

  const handleDecline = async (reason) => {
    await onRespond(event.id, 'DECLINED', reason);
    setDeclining(false);
  };

  return (
    <article
      className={`card ${past ? 'opacity-70' : ''} ${
        running ? 'border-l-[3px] border-l-hsg-green' : ''
      }`}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* ------------------------------------------------ Datumsblock */}
        <div className="event-date" aria-hidden="true">
          <span className="event-date__weekday">{weekday}</span>
          <span className="event-date__day">{day}</span>
          <span className="event-date__month">{month}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold uppercase tracking-[0.03em] text-ink">
                {event.title}
              </h3>
              <p className="mt-0.5 text-sm text-ink-soft">
                {formatTimeRange(event.startTime, event.endTime)}
                {event.location && (
                  <>
                    {' · '}
                    <span className="text-ink-muted">{event.location}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {running && (
                <span className="badge badge-live">
                  <span className="live-dot" aria-hidden="true" />
                  Läuft
                </span>
              )}
              {showTeam && event.teamCode && (
                <span className="badge badge-neutral">{event.teamCode}</span>
              )}
              <span className="badge badge-neutral">
                {eventTypeLabel(event.type)}
              </span>
              {isMultiDay(event.startTime, event.endTime) && (
                <span className="badge badge-neutral">mehrtägig</span>
              )}
            </div>
          </div>

          {/* ------------------------------------------- Status & Zahlen */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {mine ? (
              <StatusBadge status={mine.status} source={mine.source} withHint />
            ) : (
              <span className="text-xs text-ink-muted">
                Du stehst nicht im Kader dieser Mannschaft.
              </span>
            )}
            <AttendanceCounts counts={event.counts} />
          </div>

          {mine?.reason && (
            <p className="mt-1.5 text-sm text-ink-soft">
              Dein Grund: <span className="font-semibold">{mine.reason}</span>
            </p>
          )}

          {/* --------------------------------------------- Schnellaktion */}
          {mine && !past && !declining && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleAttend}
                className={`btn btn-sm ${
                  mine.status === 'ATTENDING' ? 'btn-primary' : 'btn-outline'
                }`}
              >
                Ich bin dabei
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeclining(true)}
                className="btn btn-sm btn-danger"
              >
                {mine.status === 'DECLINED' ? 'Grund ändern' : 'Abmelden'}
              </button>
            </div>
          )}

          {mine && past && (
            <p className="field-hint">
              Der Termin ist vorbei – Änderungen trägt nur noch das
              Trainerteam ein.
            </p>
          )}

          {declining && (
            <DeclineForm
              busy={busy}
              initialReason={
                mine?.status === 'DECLINED' && mine.source !== 'ABSENCE'
                  ? mine.reason ?? ''
                  : ''
              }
              onSubmit={handleDecline}
              onCancel={() => setDeclining(false)}
            />
          )}

          {/* --------------------------------------------- Wer fehlt? */}
          {event.declined?.length > 0 && (
            <div className="mt-3">
              <p className="eyebrow">Absagen</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {event.declined.map((entry) => (
                  <li key={entry.userId} className="tag">
                    <span
                      className={`status-dot ${
                        entry.source === 'ABSENCE' ? 'bg-warn' : 'bg-danger'
                      }`}
                      aria-hidden="true"
                    />
                    {entry.firstName} {entry.lastName}
                    {entry.reason && (
                      <span className="font-normal text-ink-muted">
                        · {entry.reason}
                      </span>
                    )}
                    {entry.reasonHidden && (
                      <span className="font-normal text-ink-muted">
                        · Grund nur für das Trainerteam
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ------------------------------------------------- Fußzeile */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="btn btn-ghost btn-sm"
            >
              {expanded ? 'Kader ausblenden' : 'Kader anzeigen'}
            </button>

            {event.canManage && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onEdit?.(event)}
                  className="btn btn-ghost btn-sm"
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete?.(event)}
                  className="btn btn-ghost btn-sm text-danger hover:text-danger"
                >
                  Löschen
                </button>
              </>
            )}

            {event.canManage && !event.reasonsVisibleToAll && (
              <span className="ml-auto text-xs text-ink-muted">
                Gründe nur für das Trainerteam sichtbar
              </span>
            )}
          </div>

          {expanded && (
            <EventAttendance
              eventId={event.id}
              viewerId={viewerId}
              canManage={event.canManage}
              busy={busy}
              onRespond={onRespond}
            />
          )}
        </div>
      </div>
    </article>
  );
}
