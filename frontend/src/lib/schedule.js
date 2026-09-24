// Vokabular und Formate des Termin-Moduls.
// Die Schlüssel müssen zu den ENUMs aus backend/utils/schedule.js passen.
//
// Zeitangaben kommen als `YYYY-MM-DDTHH:MM:SS` OHNE Zeitzone vom Server.
// `new Date()` liest diese Form als ORTSZEIT – genau richtig: Ein Training um
// 19:00 Uhr steht in der App um 19:00 Uhr, egal wo der Server läuft.
// Reine Datumsangaben (`YYYY-MM-DD`) werden BEWUSST NICHT durch `Date`
// geschickt: die liest der Standard als UTC, wodurch der 1. Juli in
// westlicheren Zeitzonen zum 30. Juni würde.

// --- Terminarten ------------------------------------------------------------

export const EVENT_TYPE_LABELS = {
  REGULAR_TRAINING: 'Training',
  SINGLE_TRAINING: 'Zusatztraining',
  EVENT_CAMP: 'Sondertermin',
  MATCH: 'Spiel',
};

/**
 * Grobe Gruppen für die Filter. Die Oberfläche fragt „nur Training" oder
 * „nur Spiele" – nicht nach den vier Einzelwerten. Die Schlüssel müssen zu
 * EVENT_CATEGORIES in backend/utils/schedule.js passen.
 */
export const EVENT_CATEGORIES = [
  { key: 'training', label: 'Training', types: ['REGULAR_TRAINING', 'SINGLE_TRAINING'] },
  { key: 'match', label: 'Spiele', types: ['MATCH'] },
  { key: 'other', label: 'Sonstiges', types: ['EVENT_CAMP'] },
];

export function eventTypeLabel(type) {
  return EVENT_TYPE_LABELS[type] ?? type;
}

// --- Abwesenheiten ----------------------------------------------------------

export const ABSENCE_TYPES = ['VACATION', 'INJURY', 'OTHER'];

export const ABSENCE_TYPE_LABELS = {
  VACATION: 'Urlaub',
  INJURY: 'Verletzung',
  OTHER: 'Sonstiges',
};

export function absenceTypeLabel(type) {
  return ABSENCE_TYPE_LABELS[type] ?? type;
}

// --- Wochentage -------------------------------------------------------------

/** ISO-Wochentage: 1 = Montag … 7 = Sonntag (wie im Backend). */
export const WEEKDAYS = [
  { value: 1, short: 'Mo', label: 'Montag' },
  { value: 2, short: 'Di', label: 'Dienstag' },
  { value: 3, short: 'Mi', label: 'Mittwoch' },
  { value: 4, short: 'Do', label: 'Donnerstag' },
  { value: 5, short: 'Fr', label: 'Freitag' },
  { value: 6, short: 'Sa', label: 'Samstag' },
  { value: 7, short: 'So', label: 'Sonntag' },
];

export function weekdayList(values = []) {
  return WEEKDAYS.filter((day) => values.includes(day.value))
    .map((day) => day.short)
    .join(' + ');
}

// --- Abmeldegründe ----------------------------------------------------------

/**
 * Häufige Gründe als Ein-Klick-Vorschlag. Ein Freitextfeld gibt es trotzdem –
 * die Liste soll die Abmeldung beschleunigen, nicht einschränken.
 */
export const QUICK_REASONS = [
  'Krank',
  'Beruflich',
  'Schule / Uni',
  'Familie',
  'Verletzt',
  'Andere Mannschaft',
];

// --- Status und Farben ------------------------------------------------------

/**
 * Anzeige eines Anwesenheitsstatus.
 *
 * Grün  = dabei
 * Rot   = abgesagt
 * Gelb  = längerfristig abwesend (Urlaub / Verletzung)
 *
 * „Keine Rückmeldung" ist bewusst GRÜN und nicht gelb: Wer nichts sagt, ist
 * laut Regel dabei und wird auch so gezählt. Ein gelber Chip würde
 * suggerieren, die Zusage fehle noch. Der Zusatz „keine Rückmeldung" macht
 * den Unterschied trotzdem sichtbar.
 */
export function statusPresentation(status, source) {
  if (status === 'DECLINED') {
    // Urlaub und Verletzung sind etwas anderes als eine kurzfristige Absage –
    // deshalb gelb statt rot.
    return source === 'ABSENCE'
      ? { label: 'Nicht da', badge: 'badge-pending', dot: 'bg-warn' }
      : { label: 'Abgesagt', badge: 'badge-declined', dot: 'bg-danger' };
  }
  // Zwischen „hat zugesagt" und „hat nichts gesagt" wird bewusst NICHT mehr
  // unterschieden: Dabeisein ist der Normalfall, beides zählt gleich.
  return { label: 'Dabei', badge: 'badge-confirmed', dot: 'bg-hsg-green' };
}

/**
 * Erklärt den EIGENEN Status, wenn er nicht selbst gesetzt wurde.
 *
 * Bewusst nur für die eigene Zeile: In der Kaderliste stand dieser Zusatz
 * hinter jedem Namen und machte sie unlesbar.
 */
export function sourceHint(source) {
  if (source === 'COACH') return 'vom Trainerteam eingetragen';
  if (source === 'ABSENCE') return 'aus Urlaub / Verletzung';
  return null;
}

// --- Datum & Uhrzeit --------------------------------------------------------

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

/** `YYYY-MM-DDTHH:MM:SS` -> Date in Ortszeit. null bei ungültiger Eingabe. */
export function parseEventTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Bausteine für den Datumsblock einer Terminkarte. */
export function dateParts(value) {
  const date = parseEventTime(value);
  if (!date) return { weekday: '—', day: '', month: '' };
  return {
    weekday: DAY_SHORT[date.getDay()],
    day: String(date.getDate()),
    month: MONTH_SHORT[date.getMonth()],
  };
}

/** „Dienstag, 29. September 2026" */
export function formatEventDay(value) {
  const date = parseEventTime(value);
  if (!date) return '—';
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** „19:00" */
export function formatClock(value) {
  const date = parseEventTime(value);
  if (!date) return '—';
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Zeitspanne eines Termins.
 * Ein Tag: „19:00 – 20:30 Uhr"
 * Mehrere Tage: „29. Sep, 09:00 – 31. Sep, 16:00"
 */
export function formatTimeRange(startTime, endTime) {
  const start = parseEventTime(startTime);
  const end = parseEventTime(endTime);
  if (!start || !end) return '—';

  const sameDay = startTime.slice(0, 10) === endTime.slice(0, 10);
  if (sameDay) {
    return `${formatClock(startTime)} – ${formatClock(endTime)} Uhr`;
  }

  const short = (date) =>
    date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return `${short(start)}, ${formatClock(startTime)} – ${short(end)}, ${formatClock(endTime)}`;
}

/** Dauert der Termin über mehr als einen Kalendertag? */
export function isMultiDay(startTime, endTime) {
  return Boolean(startTime && endTime) && startTime.slice(0, 10) !== endTime.slice(0, 10);
}

/** `YYYY-MM-DD` -> „01.07.2026" (ohne Umweg über `Date`, siehe Kopf). */
export function formatIsoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

/** Zeitraum zweier `YYYY-MM-DD`-Werte: „01.07. – 15.07.2026" */
export function formatIsoRange(from, to) {
  if (from === to) return formatIsoDate(from);
  const start = formatIsoDate(from);
  const end = formatIsoDate(to);
  // Gleiches Jahr -> die Jahreszahl nur einmal.
  if (start.slice(-4) === end.slice(-4)) {
    return `${start.slice(0, 6)} – ${end}`;
  }
  return `${start} – ${end}`;
}

/** Liegt der Termin in der Vergangenheit? */
export function isPast(endTime) {
  const date = parseEventTime(endTime);
  return Boolean(date) && date.getTime() < Date.now();
}

/** Läuft der Termin gerade? */
export function isRunning(startTime, endTime) {
  const start = parseEventTime(startTime);
  const end = parseEventTime(endTime);
  if (!start || !end) return false;
  const now = Date.now();
  return start.getTime() <= now && now <= end.getTime();
}

// --- Werte für Formularfelder ----------------------------------------------

/** Date -> `YYYY-MM-DD` (Wert eines <input type="date">). */
export function toDateInput(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` um n Tage verschieben. */
export function shiftIsoDate(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return toDateInput(date);
}
