import { useState } from 'react';

import {
  dateParts,
  eventTypeLabel,
  formatTimeRange,
  isMultiDay,
  isPast,
  isRunning,
  sourceHint,
} from '../../lib/schedule';
import DeclineForm from './DeclineForm';
import TeamRoster from './TeamRoster';

/** Zwei Köpfe – der Knopf zur Mannschaftsübersicht. */
function RosterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9.25" cy="8.25" r="3.25" />
      <path d="M3.25 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.35a3.25 3.25 0 0 1 0 5.8" />
      <path d="M17.4 13.6a6 6 0 0 1 3.35 5.4" />
    </svg>
  );
}

/**
 * Ein Termin in der Liste.
 *
 * Die Karte beantwortet von oben nach unten drei Fragen, in genau dieser
 * Reihenfolge:
 *
 *   1. Was und wann?        Datum, Titel, Mannschaft, Uhrzeit, Ort
 *   2. Bin ICH dabei?       breiter, farbiger Balken – die Frage, wegen der
 *                           die meisten die App überhaupt öffnen
 *   3. Wer sonst?           kleiner Knopf, der die Mannschaft aufklappt
 *
 * Ein abgesagter Termin bekommt eine rote Fläche über der ganzen Karte: Das
 * muss man beim Überfliegen sehen, ohne zu lesen.
 *
 * @param {{ event: object, viewerId: number, busy?: boolean,
 *           onRespond: (eventId:number, status:string, reason:string|null,
 *                       userId?:number) => Promise<void>,
 *           onEdit?: (event:object) => void,
 *           onCancel?: (event:object) => void,
 *           onDelete?: (event:object) => void }} props
 */
export default function EventCard({
  event,
  viewerId,
  busy = false,
  onRespond,
  onEdit,
  onCancel,
  onDelete,
}) {
  const [declining, setDeclining] = useState(false);
  const [showRoster, setShowRoster] = useState(false);

  const { weekday, day, month } = dateParts(event.startTime);
  const past = isPast(event.endTime);
  const running = isRunning(event.startTime, event.endTime);
  const cancelled = Boolean(event.cancelledAt);

  const mine = event.myStatus;
  const declined = mine?.status === 'DECLINED';
  const byAbsence = mine?.source === 'ABSENCE';

  // Nur kennzeichnen, wo die Art etwas aussagt – bei einem Training stünde
  // sonst dreimal „Training" auf derselben Karte.
  const showType = event.type === 'MATCH' || event.type === 'EVENT_CAMP';

  const respond = async (status, reason) => {
    await onRespond(event.id, status, reason);
    setDeclining(false);
  };

  const barTone = declined ? (byAbsence ? 'absent' : 'no') : 'yes';
  const barLabel = declined
    ? byAbsence
      ? 'Du bist nicht da'
      : 'Du bist abgemeldet'
    : 'Du bist dabei';

  return (
    <article
      className={`card ${past && !cancelled ? 'opacity-60' : ''} ${
        running ? 'border-l-[3px] border-l-hsg-green' : ''
      }`}
    >
      {cancelled && (
        <p className="event-cancelled">
          <span className="event-cancelled__label">Abgesagt</span>
          {event.cancelReason && (
            <span className="text-sm">{event.cancelReason}</span>
          )}
        </p>
      )}

      {/* --------------------------------------------- 1. Was und wann? */}
      <div className="flex gap-3 sm:gap-4">
        <div className="event-date" aria-hidden="true">
          <span className="event-date__weekday">{weekday}</span>
          <span className="event-date__day">{day}</span>
          <span className="event-date__month">{month}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={`min-w-0 font-display text-base font-bold uppercase tracking-[0.03em] text-ink ${
                cancelled ? 'line-through decoration-danger' : ''
              }`}
            >
              {event.title}
            </h3>
            {running && !cancelled && (
              <span className="badge badge-live shrink-0">
                <span className="live-dot" aria-hidden="true" />
                Läuft
              </span>
            )}
          </div>

          {/* Mannschaft zuerst: sie beantwortet „betrifft mich das?" */}
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{event.teamName}</span>
            {' · '}
            {formatTimeRange(event.startTime, event.endTime)}
            {event.location && ` · ${event.location}`}
            {showType && ` · ${eventTypeLabel(event.type)}`}
            {isMultiDay(event.startTime, event.endTime) && ' · mehrtägig'}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ 2. Bin ich dabei? */}
      {mine && !cancelled && (
        <>
          <div className={`attend-bar attend-bar--${barTone}`}>
            <span className="min-w-0">
              <span className="attend-bar__label">{barLabel}</span>
              {(mine.reason || sourceHint(mine.source)) && (
                <span className="mt-0.5 block text-sm text-ink-soft">
                  {mine.reason ?? sourceHint(mine.source)}
                </span>
              )}
            </span>

            {!past && !declining && (
              <span className="flex shrink-0 flex-wrap gap-2">
                {declined ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => respond('ATTENDING', null)}
                      className="btn btn-sm btn-primary"
                    >
                      Doch dabei
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDeclining(true)}
                      className="btn btn-sm btn-ghost"
                    >
                      Grund ändern
                    </button>
                  </>
                ) : (
                  // Kein „Ich bin dabei"-Knopf: Zusagen ist der Standard, da
                  // gibt es nichts zu bestätigen.
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclining(true)}
                    className="btn btn-sm btn-danger"
                  >
                    Abmelden
                  </button>
                )}
              </span>
            )}
          </div>

          {declining && (
            <DeclineForm
              busy={busy}
              initialReason={declined && !byAbsence ? mine.reason ?? '' : ''}
              onSubmit={(reason) => respond('DECLINED', reason)}
              onCancel={() => setDeclining(false)}
            />
          )}
        </>
      )}

      {/* --------------------------------------------------- 3. Wer sonst? */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => setShowRoster((value) => !value)}
          aria-expanded={showRoster}
          className="btn btn-ghost btn-sm"
        >
          <RosterIcon />
          {event.counts.rosterSize > 0
            ? `${event.counts.attending} von ${event.counts.rosterSize}`
            : 'Mannschaft'}
        </button>

        {event.canManage && (
          <span className="ml-auto flex flex-wrap gap-x-2">
            {!event.nuligaGameId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit?.(event)}
                className="btn btn-ghost btn-sm"
              >
                Bearbeiten
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel?.(event)}
              className="btn btn-ghost btn-sm text-danger hover:text-danger"
            >
              {cancelled ? 'Absage zurücknehmen' : 'Absagen'}
            </button>
            {!event.nuligaGameId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete?.(event)}
                className="btn btn-ghost btn-sm"
              >
                Löschen
              </button>
            )}
          </span>
        )}
      </div>

      {showRoster && (
        <TeamRoster
          eventId={event.id}
          viewerId={viewerId}
          canManage={event.canManage}
          busy={busy}
          onRespond={onRespond}
        />
      )}
    </article>
  );
}
