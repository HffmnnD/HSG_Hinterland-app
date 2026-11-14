// Datumsrechnung und Anordnung für die Kalender-Übersicht (Monat / Woche).
// Gerechnet wird mit Ortszeit-Dates und `YYYY-MM-DD`-Schlüsseln.
import { toDateInput } from './schedule';

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** `YYYY-MM-DD` -> Date (Mitternacht, Ortszeit). */
export function parseDay(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const addDays = (key, days) => {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
};

/** Montag der Woche, in der `key` liegt. */
export function startOfWeek(key) {
  const date = parseDay(key);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toDateInput(date);
}

/** Erster Tag des Monats. */
export const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

/** Sichtbare Tage: Woche = 7, Monat = volle Wochen (Mo–So) um den Monat. */
export function visibleDays(view, anchor) {
  if (view === 'week') {
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }
  const monthStart = startOfMonth(anchor);
  const first = startOfWeek(monthStart);
  const nextMonth = parseDay(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const lastOfMonth = addDays(toDateInput(nextMonth), -1);
  const last = addDays(startOfWeek(lastOfMonth), 6);
  const days = [];
  for (let key = first; key <= last; key = addDays(key, 1)) days.push(key);
  return days;
}

/** Vor/zurück um einen Monat bzw. eine Woche. */
export function shiftAnchor(view, anchor, direction) {
  if (view === 'week') return addDays(anchor, 7 * direction);
  const date = parseDay(startOfMonth(anchor));
  date.setMonth(date.getMonth() + direction);
  return toDateInput(date);
}

/** Überschrift: „Oktober 2026" bzw. „12.–18. Okt. 2026". */
export function rangeLabel(view, anchor) {
  if (view !== 'week') {
    const date = parseDay(anchor);
    return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  }
  const days = visibleDays('week', anchor);
  const first = parseDay(days[0]);
  const last = parseDay(days[6]);
  const fmt = (date, withMonth) =>
    date.toLocaleDateString('de-DE', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  const sameMonth = first.getMonth() === last.getMonth();
  return `${fmt(first, !sameMonth)} – ${fmt(last, true)} ${last.getFullYear()}`;
}

/** Minuten seit Mitternacht aus `YYYY-MM-DDTHH:MM…`. */
export const minutesOf = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** Liegt der Eintrag (auch teilweise) an diesem Tag? */
export function touchesDay(entry, key) {
  const startDay = entry.start.slice(0, 10);
  const endDay = entry.end.slice(0, 10);
  // Ende genau um Mitternacht zählt nicht mehr zum Folgetag.
  const endsAtMidnight = entry.end.slice(11, 16) === '00:00' && endDay > startDay;
  const lastDay = endsAtMidnight ? addDays(endDay, -1) : endDay;
  return startDay <= key && key <= lastDay;
}

/**
 * Einträge eines Tages für die Wochenansicht: Anfang/Ende in Minuten (auf
 * den Tag beschnitten) und Spalten bei Überschneidung.
 * @returns {{entry:object, top:number, bottom:number, col:number, cols:number}[]}
 */
export function layoutDay(entries, key) {
  const items = entries
    .filter((entry) => touchesDay(entry, key))
    .map((entry) => ({
      entry,
      top: entry.start.slice(0, 10) < key ? 0 : minutesOf(entry.start),
      bottom: entry.end.slice(0, 10) > key ? 1440 : minutesOf(entry.end),
    }))
    .map((item) => ({ ...item, bottom: Math.max(item.bottom, item.top + 15) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // Gruppen sich überschneidender Einträge, darin gierig Spalten vergeben.
  const result = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((item) => item.col + 1));
    for (const item of group) result.push({ ...item, cols });
    group = [];
  };
  for (const item of items) {
    if (item.top >= groupEnd && group.length > 0) flush();
    const used = new Set(group.filter((other) => other.bottom > item.top).map((other) => other.col));
    let col = 0;
    while (used.has(col)) col += 1;
    group.push({ ...item, col });
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  if (group.length > 0) flush();
  return result;
}
