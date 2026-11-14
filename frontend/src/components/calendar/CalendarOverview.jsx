import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useApiResource, useEvents } from '../../hooks/useSchedule';
import { useDuties } from '../../hooks/useDuties';
import { formatClock, formatEventDay, toDateInput } from '../../lib/schedule';
import CalendarExport from './CalendarExport';
import {
  WEEKDAY_SHORT,
  layoutDay,
  parseDay,
  rangeLabel,
  shiftAnchor,
  touchesDay,
  visibleDays,
} from '../../lib/calendar';

// Arten im Kalender. `tone` ist die Farbe aus design.css (--c-cal-*).
const KINDS = [
  { key: 'training', label: 'Training', tone: 'training' },
  { key: 'match', label: 'Spiele', tone: 'match' },
  { key: 'other', label: 'Sonstiges', tone: 'other' },
  { key: 'duty', label: 'Meine Dienste', tone: 'duty' },
];

const KIND_OF_TYPE = {
  REGULAR_TRAINING: 'training',
  SINGLE_TRAINING: 'training',
  MATCH: 'match',
  EVENT_CAMP: 'other',
};

const HOUR_PX = 44;

const selectClubEvents = (result) => result?.events ?? [];
const NO_CLUB_EVENTS = [];

/** Termine, Vereinstermine und eigene Dienste in eine Liste gleicher Form bringen. */
function toEntries(events, plans, clubEvents = []) {
  const entries = events.map((event) => ({
    id: `e-${event.id}`,
    kind: KIND_OF_TYPE[event.type] ?? 'other',
    title: event.title,
    sub: [event.teamName, event.location].filter(Boolean).join(' · '),
    start: event.startTime,
    end: event.endTime,
    cancelled: Boolean(event.cancelledAt),
  }));
  // Vereinstermine – außer denen, zu denen man abgesagt hat.
  for (const event of clubEvents) {
    if (event.myResponse?.status === 'no') continue;
    entries.push({
      id: `c-${event.id}`,
      kind: 'other',
      title: event.title,
      sub: ['Vereinstermin', event.location].filter(Boolean).join(' · '),
      start: event.startTime,
      end: event.endTime,
      cancelled: Boolean(event.cancelledAt),
    });
  }
  for (const plan of plans) {
    for (const duty of plan.duties) {
      if (!duty.mine) continue;
      entries.push({
        id: `d-${duty.id}`,
        kind: 'duty',
        title: duty.title,
        sub: [plan.title, plan.location].filter(Boolean).join(' · '),
        start: duty.startTime,
        end: duty.endTime,
        cancelled: false,
      });
    }
  }
  return entries.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Eigener Kalender: Monat oder Woche mit den festen Terminen – Trainings,
 * Spiele und Sondertermine der eigenen Mannschaften und die eigenen Dienste.
 * Offene Dienste stehen nur im Bereich „Dienste“.
 *
 * @param {{ onOpenDuties: () => void }} props
 */
// compact: Kachel auf der Startseite – Woche statt Monat, ohne Filter und
// ohne Kalender-Abo (das liegt unter „Mein Konto").
export default function CalendarOverview({ onOpenDuties, compact = false }) {
  const today = toDateInput();
  const [view, setView] = useState(compact ? 'week' : 'month');
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState(() => new Set());

  const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
  const from = days[0];
  const to = days[days.length - 1];

  const { events, loading: eventsLoading, error: eventsError } = useEvents({ from, to, mine: true });
  const { plans, loading: dutiesLoading, error: dutiesError } = useDuties({ from, to });

  const { data: clubEvents } = useApiResource(`/api/club-events?from=${from}&to=${to}`, selectClubEvents, NO_CLUB_EVENTS);

  const entries = useMemo(
    () => toEntries(events, plans, clubEvents).filter((entry) => !hidden.has(entry.kind)),
    [events, plans, clubEvents, hidden]
  );
  const byDay = useMemo(() => {
    const map = new Map(days.map((key) => [key, []]));
    for (const entry of entries) {
      for (const key of days) if (touchesDay(entry, key)) map.get(key).push(entry);
    }
    return map;
  }, [entries, days]);

  const toggleKind = (key) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const go = (direction) => {
    const next = shiftAnchor(view, anchor, direction);
    setAnchor(next);
    setSelected(view === 'week' ? next : next.slice(0, 7) === today.slice(0, 7) ? today : next);
  };

  const goToday = () => {
    setAnchor(today);
    setSelected(today);
  };

  const loading = eventsLoading || dutiesLoading;
  const monthKey = anchor.slice(0, 7);
  const selectedEntries = byDay.get(selected) ?? [];

  return (
    <div className="space-y-4">
      {(eventsError || dutiesError) && (
        <div role="alert" className="alert alert-error">
          {eventsError ?? dutiesError}
        </div>
      )}

      {/* ------------------------------------------------ Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <button type="button" onClick={() => go(-1)} aria-label="Zurück" className="btn btn-ghost btn-sm">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Weiter" className="btn btn-ghost btn-sm">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 className="section-title min-w-0 flex-1 whitespace-nowrap text-base" aria-live="polite">
          {rangeLabel(view, anchor)}
        </h2>
        <button type="button" onClick={goToday} className="btn btn-outline btn-sm">
          Heute
        </button>
        <div className="switcher w-full justify-center sm:w-auto" role="group" aria-label="Ansicht">
          {[
            { key: 'month', label: 'Monat' },
            { key: 'week', label: 'Woche' },
          ].map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={view === entry.key}
              onClick={() => {
                setView(entry.key);
                setAnchor(selected);
              }}
              className={`switcher__btn ${view === entry.key ? 'switcher__btn--active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {!compact && (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Anzeigen">
        {KINDS.map((kind) => (
          <button
            key={kind.key}
            type="button"
            aria-pressed={!hidden.has(kind.key)}
            onClick={() => toggleKind(kind.key)}
            className={`chip chip-sm ${hidden.has(kind.key) ? 'opacity-50' : ''}`}
          >
            <span className={`cal-dot cal-tone-${kind.tone}`} aria-hidden="true" />
            {kind.label}
          </button>
        ))}
      </div>
      )}

      <div className={`cal ${loading ? 'opacity-60' : ''}`}>
        {view === 'month' ? (
          <MonthGrid
            days={days}
            byDay={byDay}
            monthKey={monthKey}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <WeekGrid
            days={days}
            entries={entries}
            byDay={byDay}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </div>

      {/* --------------------------------------- Einträge des Tages */}
      <section aria-label="Ausgewählter Tag" className={view === 'week' ? 'md:hidden' : ''}>
        <h3 className="eyebrow">{formatEventDay(`${selected}T00:00:00`)}</h3>
        {selectedEntries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nichts eingetragen.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {selectedEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onOpenDuties={onOpenDuties} />
            ))}
          </ul>
        )}
      </section>

      {!compact && <CalendarExport />}
    </div>
  );
}

function EntryCard({ entry, onOpenDuties }) {
  const isDuty = entry.kind === 'duty';
  return (
    <li className={`cal-card cal-tone-${entry.kind}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-muted">
          {formatClock(entry.start)} – {formatClock(entry.end)} Uhr
        </p>
        <p className={`text-sm font-bold text-ink ${entry.cancelled ? 'line-through' : ''}`}>{entry.title}</p>
        {entry.sub && <p className="text-xs text-ink-soft">{entry.sub}</p>}
      </div>
      {isDuty && (
        <button type="button" onClick={onOpenDuties} className="btn btn-ghost btn-sm shrink-0">
          Ansehen
        </button>
      )}
    </li>
  );
}

function MonthGrid({ days, byDay, monthKey, today, selected, onSelect }) {
  return (
    <div role="grid" aria-label="Monat">
      <div className="cal-head" role="row">
        {WEEKDAY_SHORT.map((label) => (
          <span key={label} role="columnheader">
            {label}
          </span>
        ))}
      </div>
      <div className="cal-month">
        {days.map((key) => {
          const list = byDay.get(key) ?? [];
          const outside = key.slice(0, 7) !== monthKey;
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-selected={selected === key}
              aria-label={`${formatEventDay(`${key}T00:00:00`)}, ${list.length} Einträge`}
              onClick={() => onSelect(key)}
              className={`cal-cell ${outside ? 'cal-cell--outside' : ''} ${
                selected === key ? 'cal-cell--selected' : ''
              }`}
            >
              <span className={`cal-daynum ${key === today ? 'cal-daynum--today' : ''}`}>
                {parseDay(key).getDate()}
              </span>
              {/* Handy: Punkte. Ab md: Zeilen mit Uhrzeit. */}
              <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                {list.slice(0, 4).map((entry) => (
                  <span key={entry.id} className={`cal-dot cal-tone-${entry.kind}`} />
                ))}
              </span>
              <span className="hidden w-full space-y-0.5 md:block">
                {list.slice(0, 3).map((entry) => (
                  <span
                    key={entry.id}
                    className={`cal-line cal-tone-${entry.kind} ${entry.cancelled ? 'line-through' : ''}`}
                  >
                    {entry.start.slice(0, 10) === key && <b>{formatClock(entry.start)}</b>} {entry.title}
                  </span>
                ))}
                {list.length > 3 && <span className="block text-[0.6875rem] text-ink-muted">+{list.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ days, entries, byDay, today, selected, onSelect }) {
  // Sichtbarer Zeitraum: 8–22 Uhr, bei Bedarf weiter.
  const laid = days.map((key) => layoutDay(entries, key));
  const allItems = laid.flat();
  const firstHour = Math.min(8, ...allItems.map((item) => Math.floor(item.top / 60)));
  const lastHour = Math.max(22, ...allItems.map((item) => Math.ceil(item.bottom / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);

  return (
    <>
      {/* Handy: Tagesreihe zum Antippen, Einträge stehen darunter. */}
      <div className="cal-week-strip md:hidden">
        {days.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={selected === key}
            onClick={() => onSelect(key)}
            className={`cal-cell ${selected === key ? 'cal-cell--selected' : ''}`}
          >
            <span className="text-[0.6875rem] text-ink-muted">{WEEKDAY_SHORT[(parseDay(key).getDay() + 6) % 7]}</span>
            <span className={`cal-daynum ${key === today ? 'cal-daynum--today' : ''}`}>{parseDay(key).getDate()}</span>
            <span className="flex flex-wrap justify-center gap-0.5">
              {(byDay.get(key) ?? []).slice(0, 4).map((entry) => (
                <span key={entry.id} className={`cal-dot cal-tone-${entry.kind}`} />
              ))}
            </span>
          </button>
        ))}
      </div>

      {/* Ab md: Zeitraster wie im Google Kalender. */}
      <div className="hidden md:block">
        <div className="cal-week-head">
          <span />
          {days.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`text-center ${key === today ? 'text-hsg-green-dark' : 'text-ink-muted'}`}
            >
              <span className="block text-[0.6875rem] uppercase">{WEEKDAY_SHORT[(parseDay(key).getDay() + 6) % 7]}</span>
              <span className={`cal-daynum ${key === today ? 'cal-daynum--today' : ''}`}>{parseDay(key).getDate()}</span>
            </button>
          ))}
        </div>
        <div className="cal-week-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="relative">
            {hours.map((hour) => (
              <span key={hour} className="cal-hour" style={{ top: (hour - firstHour) * HOUR_PX }}>
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((key, index) => (
            <div key={key} className="cal-week-col">
              {hours.map((hour) => (
                <span key={hour} className="cal-hour-line" style={{ top: (hour - firstHour) * HOUR_PX }} />
              ))}
              {laid[index].map(({ entry, top, bottom, col, cols }) => (
                <div
                  key={entry.id}
                  className={`cal-block cal-tone-${entry.kind} ${entry.cancelled ? 'line-through' : ''}`}
                  style={{
                    top: ((top - firstHour * 60) / 60) * HOUR_PX,
                    height: Math.max(18, ((bottom - top) / 60) * HOUR_PX - 2),
                    left: `${(col / cols) * 100}%`,
                    width: `calc(${100 / cols}% - 2px)`,
                  }}
                  title={`${formatClock(entry.start)}–${formatClock(entry.end)} ${entry.title}${
                    entry.sub ? ` · ${entry.sub}` : ''
                  }`}
                >
                  <b>{formatClock(entry.start)}</b> {entry.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
