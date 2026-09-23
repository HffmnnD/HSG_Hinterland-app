// Zentrale Definitionen des Termin-Moduls (müssen zu den ENUMs aus
// Migration 006 passen) und die Erzeugung wiederkehrender Trainingstermine.
//
// Zeitrechnung: Termine sind WANDUHRZEITEN ("dienstags 19:00"), keine
// Zeitpunkte auf einem Zeitstrahl. Deshalb wird hier ausschließlich mit
// Zeichenketten `YYYY-MM-DD HH:MM:SS` und UTC-basierter Arithmetik gerechnet:
// So verschiebt eine Sommerzeit-Umstellung zwischen zwei Trainingseinheiten
// die Uhrzeit nicht um eine Stunde.

// --- ENUM-Werte -------------------------------------------------------------

const EVENT_TYPES = [
  'REGULAR_TRAINING',
  'SINGLE_TRAINING',
  'EVENT_CAMP',
  'MATCH',
];

const ATTENDANCE_STATUS = ['ATTENDING', 'DECLINED'];

const ABSENCE_TYPES = ['VACATION', 'INJURY', 'OTHER'];

// Wer keinen Eintrag hat, ist dabei. Der Kern des ganzen Moduls: im Training
// muss sich nur melden, wer NICHT kommt.
const DEFAULT_STATUS = 'ATTENDING';

/**
 * Herkunft eines Anwesenheitsstatus – entscheidet in der Oberfläche über die
 * Beschriftung („du hast abgesagt" / „vom Trainer eingetragen" / „Urlaub").
 */
const STATUS_SOURCES = {
  DEFAULT: 'DEFAULT', // keine Rückmeldung -> gilt als zugesagt
  SELF: 'SELF', // die Person selbst hat geantwortet
  COACH: 'COACH', // der/die Trainer:in hat übersteuert
  ABSENCE: 'ABSENCE', // dauerhafte Abwesenheit (Urlaub/Verletzung)
};

// --- Wochentage -------------------------------------------------------------

// Bitmaske in `event_series.weekdays`. Index = ISO-Wochentag (1 = Montag).
const WEEKDAY_BITS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64 };

/** Schutzgrenzen für eine Serie – eine Fehleingabe soll die DB nicht fluten. */
const MAX_OCCURRENCES = 400; // ca. 4 Jahre bei zwei Einheiten pro Woche
const MAX_SERIES_DAYS = 800; // knapp zwei Jahre Zeitraum

/**
 * [2, 4] (Di, Do) -> 10
 * @param {number[]} weekdays ISO-Wochentage 1-7
 */
function weekdaysToMask(weekdays) {
  return weekdays.reduce((mask, day) => mask | (WEEKDAY_BITS[day] ?? 0), 0);
}

/**
 * 10 -> [2, 4]
 * @param {number} mask
 * @returns {number[]} ISO-Wochentage, aufsteigend
 */
function maskToWeekdays(mask) {
  return [1, 2, 3, 4, 5, 6, 7].filter((day) => (mask & WEEKDAY_BITS[day]) !== 0);
}

// --- Wanduhrzeit-Arithmetik -------------------------------------------------

/**
 * `YYYY-MM-DD` + `HH:MM` -> Millisekunden seit Epoch, gerechnet ALS WÄRE die
 * Angabe UTC. Der Wert ist nur zum Weiterrechnen und Formatieren gedacht,
 * niemals zur Anzeige als Zeitpunkt.
 * @returns {number|null} null bei ungültiger Eingabe
 */
function wallClockMs(dateText, timeText) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText ?? '');
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText ?? '00:00');
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute, second] = timeMatch.map((part) => Number(part ?? 0));

  const ms = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  const back = new Date(ms);
  // Fängt „31.02." ab: Date.UTC rollt still weiter, der Rückvergleich nicht.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

const pad = (value) => String(value).padStart(2, '0');

/** Millisekunden (siehe wallClockMs) -> `YYYY-MM-DD HH:MM:SS` für MySQL. */
function toSqlDateTime(ms) {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** Millisekunden -> `YYYY-MM-DD`. */
function toSqlDate(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `HH:MM` -> Minuten seit Mitternacht. null bei ungültiger Eingabe. */
function timeToMinutes(timeText) {
  const match = /^(\d{2}):(\d{2})$/.exec(timeText ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Dauer zwischen zwei Uhrzeiten in Minuten. Liegt das Ende vor dem Beginn,
 * geht die Einheit über Mitternacht (z. B. Silvesterturnier 22:00 - 01:00).
 * @returns {number} 1-1440
 */
function durationMinutes(startMinutes, endMinutes) {
  const diff = (endMinutes - startMinutes + 1440) % 1440;
  return diff === 0 ? 1440 : diff;
}

/** Ortszeit-Zeitstempel „jetzt" als `YYYY-MM-DD HH:MM:SS` (für Vergleiche). */
function nowSqlDateTime(now = new Date()) {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Ortszeit-"jetzt" im selben Format, in dem Termine ausgelesen werden
 * (`YYYY-MM-DDTHH:MM:SS`). Damit lassen sich Termine per Zeichenketten-
 * vergleich in Vergangenheit und Zukunft trennen – ohne Zeitzonen-Umwege.
 */
function nowLocalIso(now = new Date()) {
  return nowSqlDateTime(now).replace(' ', 'T');
}

/** Ortszeit-Datum „heute" als `YYYY-MM-DD`. */
function todaySqlDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --- Serien-Erzeugung -------------------------------------------------------

/**
 * Erzeugt aus einer Serienregel die konkreten Termine.
 *
 * @param {{ weekdays:number[], startsOn:string, endsOn:string,
 *           startTime:string, endTime:string }} rule
 *   Wochentage als ISO-Zahlen (1 = Montag), Datum `YYYY-MM-DD`,
 *   Uhrzeiten `HH:MM`.
 * @returns {{ startTime:string, endTime:string }[]}
 *   Beide Werte als `YYYY-MM-DD HH:MM:SS` – direkt in `events` einsetzbar.
 */
function buildOccurrences({ weekdays, startsOn, endsOn, startTime, endTime }) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const firstDay = wallClockMs(startsOn, '00:00');
  const lastDay = wallClockMs(endsOn, '00:00');

  if (startMinutes === null || endMinutes === null) return [];
  if (firstDay === null || lastDay === null || lastDay < firstDay) return [];

  const length = durationMinutes(startMinutes, endMinutes);
  const wanted = new Set(weekdays);
  const dayMs = 24 * 60 * 60 * 1000;
  const occurrences = [];

  for (
    let day = firstDay;
    day <= lastDay && occurrences.length < MAX_OCCURRENCES;
    day += dayMs
  ) {
    // getUTCDay(): 0 = Sonntag. Auf ISO umrechnen (1 = Montag … 7 = Sonntag).
    const isoWeekday = new Date(day).getUTCDay() || 7;
    if (!wanted.has(isoWeekday)) continue;

    const begin = day + startMinutes * 60 * 1000;
    occurrences.push({
      startTime: toSqlDateTime(begin),
      endTime: toSqlDateTime(begin + length * 60 * 1000),
    });
  }

  return occurrences;
}

module.exports = {
  EVENT_TYPES,
  ATTENDANCE_STATUS,
  ABSENCE_TYPES,
  DEFAULT_STATUS,
  STATUS_SOURCES,
  WEEKDAY_BITS,
  MAX_OCCURRENCES,
  MAX_SERIES_DAYS,
  weekdaysToMask,
  maskToWeekdays,
  wallClockMs,
  toSqlDate,
  toSqlDateTime,
  timeToMinutes,
  durationMinutes,
  nowSqlDateTime,
  nowLocalIso,
  todaySqlDate,
  buildOccurrences,
};
