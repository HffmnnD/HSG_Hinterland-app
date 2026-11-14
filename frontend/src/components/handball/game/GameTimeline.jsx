import { useState } from 'react';

import CardMark from './CardMark';
import {
  EVENT_LABEL_CLASS,
  EVENT_TONE_CLASS,
  TEAM_COLOR_CLASS,
  describeEvent,
  eventMeta,
  formatPlayer,
  formatWallClock,
} from '../../../lib/handball';

const GOALS = new Set(['goal', 'penaltyGoal']);
const PENALTIES = new Set(['suspension', 'yellowCard', 'redCard', 'blueCard', 'penaltyMissed']);
// Ereignisse, bei denen die Uhrzeit besonders interessiert (immer sichtbar,
// nicht nur klein): Anpfiff, Halbzeit, Wiederanpfiff, Abpfiff, Auszeiten.
const KEY_MOMENTS = new Set(['periodStart', 'periodEnd', 'final', 'timeout']);

const FILTERS = [
  { key: 'all', label: 'Alles' },
  { key: 'goals', label: 'Tore' },
  { key: 'penalties', label: 'Strafen' },
];

/** Bezeichnung eines Trenners: Anpfiff / Wiederanpfiff / Halbzeit / Abpfiff. */
function markerLabel(event) {
  if (event.type === 'periodStart') return (event.clockSeconds ?? 0) > 0 ? 'Wiederanpfiff' : 'Anpfiff';
  if (event.type === 'periodEnd') return 'Halbzeit';
  if (event.type === 'final') return 'Abpfiff';
  return eventMeta(event.type).short;
}

/**
 * Uhrzeit einer Aktion – NUR, wenn das Backend sie live beobachtet hat.
 * Einzige Ausnahme: der Anpfiff darf auf die planmäßige Anwurfzeit
 * zurückfallen, dann deutlich als „planmäßig" beschriftet.
 */
function wallClock(event, startsAt) {
  if (event.observedAt) return { text: `${formatWallClock(event.observedAt)} Uhr`, planned: false };
  if (event.type === 'periodStart' && (event.clockSeconds ?? 0) === 0 && startsAt) {
    return { text: `planmäßig ${formatWallClock(startsAt)} Uhr`, planned: true };
  }
  return null;
}

/** Trenner auf der Zeitleiste: Anpfiff, Halbzeit, Wiederanpfiff, Abpfiff. */
function Marker({ event, startsAt }) {
  const score =
    event.scoreHome !== null && event.scoreAway !== null && (event.clockSeconds ?? 0) > 0
      ? ` · ${event.scoreHome}:${event.scoreAway}`
      : '';
  const time = wallClock(event, startsAt);
  return (
    <li className="flex items-center gap-3 py-1.5" aria-label={describeEvent(event)}>
      <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
      <span className="text-center font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted tabular-nums">
        {markerLabel(event)}
        {score}
        {time && (
          <span className={`ml-2 normal-case tracking-normal ${time.planned ? 'italic' : 'text-ink-soft'}`}>
            {time.text}
          </span>
        )}
      </span>
      <span className="h-px flex-1 bg-line-strong" aria-hidden="true" />
    </li>
  );
}

/**
 * Stand nach der Aktion. Die Zahl der Mannschaft, die gerade getroffen hat,
 * steht in ihrer Mannschaftsfarbe (Legende in der Anzeigetafel).
 */
function ScoreBadge({ event }) {
  const isGoal = GOALS.has(event.type);
  const digit = (side, value) =>
    isGoal && event.side === side ? (
      <span className={`rounded-sm px-1.5 ${TEAM_COLOR_CLASS[side]}`}>{value}</span>
    ) : (
      <span className="px-1.5 text-ink-soft">{value}</span>
    );
  return (
    <span className="flex shrink-0 items-center font-display text-lg font-bold tabular-nums sm:text-xl">
      {digit('home', event.scoreHome)}
      <span className="text-ink-muted">:</span>
      {digit('away', event.scoreAway)}
    </span>
  );
}

/**
 * Ein Ereignis. Heim- und Gastaktionen sehen GLEICH aus – unterschieden
 * werden sie nur über die Farbe im Spielstand und den Teamnamen unter dem
 * Namen. So bleibt die Liste ruhig und lesbar.
 */
function TimelineEvent({ event, homeName, awayName, startsAt }) {
  const meta = eventMeta(event.type);
  const side = event.side === 'home' || event.side === 'away' ? event.side : null;
  const teamName = event.teamName ?? (side === 'home' ? homeName : side === 'away' ? awayName : null);
  const hasScore = event.scoreHome !== null && event.scoreAway !== null;
  const player = formatPlayer(event.player, event.playerNumber);
  const time = wallClock(event, startsAt);

  return (
    <li
      className={`flex items-stretch gap-2.5 rounded-sm border sm:gap-3 ${EVENT_TONE_CLASS[meta.tone]}`}
      aria-label={describeEvent(event, homeName, awayName)}
    >
      <span className="flex w-12 shrink-0 flex-col items-center justify-center font-display text-xs font-semibold tabular-nums text-ink-muted">
        {event.clock ?? '—'}
      </span>

      <div className="min-w-0 flex-1 py-2">
        <p
          className={`flex flex-wrap items-center gap-x-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] ${EVENT_LABEL_CLASS[meta.tone]}`}
        >
          {meta.card && <CardMark color={meta.card} />}
          {meta.short}
          {time && (
            <span
              className={`font-sans text-[11px] font-normal normal-case tracking-normal ${
                KEY_MOMENTS.has(event.type) ? 'text-ink-soft' : 'text-ink-muted'
              }`}
            >
              · {time.text}
            </span>
          )}
        </p>
        {/* Erst die Mannschaft, darunter klein die Person. */}
        {teamName && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-ink">
            {side && (
              <span
                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${TEAM_COLOR_CLASS[side]}`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{teamName}</span>
          </p>
        )}
        {(player || event.text) && (
          <p className={`truncate text-xs ${teamName ? 'text-ink-muted' : 'text-sm font-bold text-ink'}`}>
            {[player, event.text].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {hasScore && (
        <span className="flex shrink-0 items-center pr-2 sm:pr-3">
          <ScoreBadge event={event} />
        </span>
      )}
    </li>
  );
}

/**
 * Spielverlauf, neueste Aktion oben, mit Filter (Alles / Tore / Strafen).
 *
 * @param {{ events: object[], homeName: string, awayName: string,
 *           startsAt?: string|null, emptyText?: string, maxEvents?: number,
 *           filterable?: boolean }} props
 */
export default function GameTimeline({
  events,
  homeName,
  awayName,
  startsAt = null,
  emptyText = 'Keine Ereignisse.',
  maxEvents = 200,
  filterable = true,
}) {
  const [filter, setFilter] = useState('all');

  const visible = events
    .filter((event) => {
      if (filter === 'goals') return GOALS.has(event.type);
      if (filter === 'penalties') return PENALTIES.has(event.type);
      return true;
    })
    .slice(0, maxEvents);

  return (
    <div>
      {filterable && events.length > 0 && (
        <div role="group" aria-label="Ereignisse filtern" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`chip chip-sm ${filter === f.key ? 'chip-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="card-note mt-3">{events.length === 0 ? emptyText : 'Nichts in dieser Auswahl.'}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {visible.map((event) =>
            eventMeta(event.type).marker ? (
              <Marker key={event.id} event={event} startsAt={startsAt} />
            ) : (
              <TimelineEvent
                key={event.id}
                event={event}
                homeName={homeName}
                awayName={awayName}
                startsAt={startsAt}
              />
            )
          )}
        </ul>
      )}
    </div>
  );
}
