// Eingabe-Prüfung des Termin-Moduls.
//
// Gleicher Vertrag wie utils/validation.js:
//   { ok: true, ...aufbereitete Werte }  oder
//   { ok: false, status, message }
// Kein Zugriff auf `req`/`res`, keine Datenbank-Schreibzugriffe.
//
// Bewusst eine eigene Datei: utils/validation.js deckt Konten, Mannschaften
// und News ab und ist bereits lang genug. Termine, Anwesenheiten und
// Abwesenheiten sind ein abgeschlossenes Thema mit eigenem Vokabular.
const {
  EVENT_TYPES,
  ATTENDANCE_STATUS,
  ABSENCE_TYPES,
  MAX_OCCURRENCES,
  MAX_SERIES_DAYS,
  wallClockMs,
  toSqlDateTime,
  timeToMinutes,
  buildOccurrences,
  weekdaysToMask,
} = require('./schedule');

// Müssen zu den Spaltenbreiten aus Migration 006 passen.
const MAX_TITLE_LENGTH = 120;
const MAX_LOCATION_LENGTH = 120;
const MAX_REASON_LENGTH = 200;
const MAX_NOTE_LENGTH = 200;

// Ein Termin, der länger als zwei Wochen dauert, ist fast sicher ein Tippfehler
// im Enddatum (z. B. Jahreszahl vergessen).
const MAX_EVENT_MINUTES = 14 * 24 * 60;

// Grenze für Abfragezeiträume (Historie, Terminliste). Verhindert, dass eine
// Anfrage versehentlich Jahrzehnte an Daten zusammenrechnet.
const MAX_RANGE_DAYS = 1100;

const fail = (message, status = 400) => ({ ok: false, status, message });

// --- kleine Bausteine -------------------------------------------------------

/** Pflicht-Text mit Längenbegrenzung. */
function cleanText(value, { label, max, required = true }) {
  if (value === undefined || value === null || value === '') {
    return required ? fail(`${label} ist erforderlich.`) : { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return fail(`${label} muss eine Zeichenkette sein.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    return required ? fail(`${label} darf nicht leer sein.`) : { ok: true, value: null };
  }
  if (text.length > max) {
    return fail(`${label} darf höchstens ${max} Zeichen lang sein.`);
  }
  return { ok: true, value: text };
}

/** `YYYY-MM-DD` aus einem Query-Parameter oder Formularfeld. */
function parseDate(value) {
  if (typeof value !== 'string') return null;
  return wallClockMs(value.trim(), '00:00') === null ? null : value.trim();
}

/**
 * `YYYY-MM-DDTHH:MM` (Wert eines <input type="datetime-local">) ->
 * `YYYY-MM-DD HH:MM:SS` für MySQL. null bei ungültiger Eingabe.
 */
function parseDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/.exec(
    value.trim()
  );
  if (!match) return null;
  const ms = wallClockMs(match[1], match[2]);
  return ms === null ? null : toSqlDateTime(ms);
}

/** Differenz zweier `YYYY-MM-DD HH:MM:SS`-Werte in Minuten. */
function minutesBetween(startSql, endSql) {
  const [startDate, startTime] = startSql.split(' ');
  const [endDate, endTime] = endSql.split(' ');
  const start = wallClockMs(startDate, startTime.slice(0, 5));
  const end = wallClockMs(endDate, endTime.slice(0, 5));
  return (end - start) / 60000;
}

/** Tage zwischen zwei `YYYY-MM-DD`-Werten. */
function daysBetween(fromDate, toDate) {
  return (
    (wallClockMs(toDate, '00:00') - wallClockMs(fromDate, '00:00')) / 86400000
  );
}

// --- Termine ----------------------------------------------------------------

/**
 * Gemeinsame Felder eines Termins (Einzeltermin wie Serie).
 *
 * @param {object} body
 * @param {{ defaultType?: string }} [opts] Terminart, wenn `type` fehlt. Beim
 *   Bearbeiten reicht der Controller die bisherige Art durch, damit ein
 *   unvollständiger Body aus einem Training kein Zusatztraining macht.
 * @returns {{ ok:true, fields:object } | { ok:false, ... }}
 */
function validateEventBase(body, { defaultType = 'SINGLE_TRAINING' } = {}) {
  const title = cleanText(body?.title, {
    label: 'Der Titel',
    max: MAX_TITLE_LENGTH,
  });
  if (!title.ok) return title;

  const location = cleanText(body?.location, {
    label: 'Der Ort',
    max: MAX_LOCATION_LENGTH,
    required: false,
  });
  if (!location.ok) return location;

  const type = body?.type ?? defaultType;
  if (!EVENT_TYPES.includes(type)) {
    return fail(`Ungültige Terminart. Erlaubt: ${EVENT_TYPES.join(', ')}.`);
  }

  const visible = body?.reasonsVisibleToAll;
  if (visible !== undefined && typeof visible !== 'boolean') {
    return fail('reasonsVisibleToAll muss true oder false sein.');
  }

  return {
    ok: true,
    fields: {
      title: title.value,
      location: location.value,
      type,
      reasons_visible_to_all: visible ? 1 : 0,
    },
  };
}

/**
 * Prüft den Body für POST /api/events.
 *
 * Zwei Varianten in einem Endpunkt:
 *   Einzeltermin -> `startTime` + `endTime`
 *   Serie        -> `recurrence: { weekdays, startsOn, endsOn, startTime, endTime }`
 *
 * @returns {{ ok:true, teamId:number, fields:object,
 *             occurrences:{startTime,endTime}[],
 *             series: object|null }
 *          | { ok:false, status, message }}
 */
function validateEventCreate(body) {
  const teamId = Number(body?.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return fail('Ungültige Mannschafts-ID.');
  }

  const isSeries =
    body?.recurrence !== undefined && body?.recurrence !== null;

  // Eine Serie ist per Definition der feste Trainingsplan – alles andere wäre
  // eine seltsame Voreinstellung für „jeden Dienstag und Donnerstag".
  const base = validateEventBase(body, {
    defaultType: isSeries ? 'REGULAR_TRAINING' : 'SINGLE_TRAINING',
  });
  if (!base.ok) return base;

  if (isSeries) {
    const series = validateRecurrence(body.recurrence);
    if (!series.ok) return series;
    return {
      ok: true,
      teamId,
      fields: base.fields,
      occurrences: series.occurrences,
      series: series.rule,
    };
  }

  const single = validateSingleTimes(body);
  if (!single.ok) return single;

  return {
    ok: true,
    teamId,
    fields: base.fields,
    occurrences: [single.times],
    series: null,
  };
}

/** Beginn/Ende eines Einzeltermins (auch mehrtägig). */
function validateSingleTimes(body) {
  const startTime = parseDateTime(body?.startTime);
  const endTime = parseDateTime(body?.endTime);

  if (!startTime) {
    return fail('Bitte einen gültigen Beginn angeben (Datum und Uhrzeit).');
  }
  if (!endTime) {
    return fail('Bitte ein gültiges Ende angeben (Datum und Uhrzeit).');
  }

  const length = minutesBetween(startTime, endTime);
  if (length <= 0) {
    return fail('Das Ende muss nach dem Beginn liegen.');
  }
  if (length > MAX_EVENT_MINUTES) {
    return fail('Ein Termin darf höchstens 14 Tage dauern.');
  }

  return { ok: true, times: { startTime, endTime } };
}

/**
 * Serienregel (wiederkehrendes Training).
 * @returns {{ ok:true, rule:object, occurrences:object[] } | { ok:false, ... }}
 */
function validateRecurrence(recurrence) {
  if (typeof recurrence !== 'object' || Array.isArray(recurrence)) {
    return fail('recurrence muss ein Objekt sein.');
  }

  const { weekdays, startsOn, endsOn, startTime, endTime } = recurrence;

  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    return fail('Bitte mindestens einen Wochentag auswählen.');
  }
  const days = [...new Set(weekdays.map(Number))];
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    return fail('Ungültiger Wochentag (erwartet 1 = Montag bis 7 = Sonntag).');
  }

  const from = parseDate(startsOn);
  const to = parseDate(endsOn);
  if (!from || !to) {
    return fail('Bitte einen gültigen Zeitraum für die Serie angeben.');
  }
  if (daysBetween(from, to) < 0) {
    return fail('Das Ende der Serie darf nicht vor ihrem Beginn liegen.');
  }
  if (daysBetween(from, to) > MAX_SERIES_DAYS) {
    return fail(
      `Der Zeitraum einer Serie darf höchstens ${MAX_SERIES_DAYS} Tage umfassen.`
    );
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return fail('Bitte gültige Uhrzeiten angeben (z. B. 19:00 und 20:30).');
  }
  if (startMinutes === endMinutes) {
    return fail('Beginn und Ende dürfen nicht identisch sein.');
  }

  const occurrences = buildOccurrences({
    weekdays: days,
    startsOn: from,
    endsOn: to,
    startTime,
    endTime,
  });

  if (occurrences.length === 0) {
    return fail(
      'In diesem Zeitraum liegt kein einziger der gewählten Wochentage.'
    );
  }
  if (occurrences.length >= MAX_OCCURRENCES) {
    return fail(
      `Eine Serie darf höchstens ${MAX_OCCURRENCES} Termine erzeugen. Bitte den Zeitraum verkürzen.`
    );
  }

  return {
    ok: true,
    occurrences,
    rule: {
      weekdays: weekdaysToMask(days),
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
      starts_on: from,
      ends_on: to,
    },
  };
}

/**
 * Prüft den Body für PUT /api/events/:id.
 *
 * Bei `scope === 'series'` werden Datum und Uhrzeit bewusst NICHT verlangt –
 * dort zählen Titel, Ort und Sichtbarkeit, die Termine selbst bleiben liegen.
 *
 * `currentType` ist die bisherige Terminart und greift, wenn der Body keine
 * mitschickt.
 *
 * @returns {{ ok:true, fields:object, times:object|null } | { ok:false, ... }}
 */
function validateEventUpdate(body, { scope = 'single', currentType } = {}) {
  const base = validateEventBase(body, { defaultType: currentType });
  if (!base.ok) return base;

  if (scope === 'series') {
    return { ok: true, fields: base.fields, times: null };
  }

  const single = validateSingleTimes(body);
  if (!single.ok) return single;

  return { ok: true, fields: base.fields, times: single.times };
}

/**
 * Prüft den Body für POST /api/events/:id/cancel.
 *
 * Beim Absagen ist ein Grund Pflicht – „fällt aus" ohne Angabe löst in der
 * Mannschaft nur Rückfragen aus. Beim Zurücknehmen der Absage braucht es
 * keinen.
 *
 * @returns {{ ok:true, cancelled:boolean, reason:string|null }
 *          | { ok:false, status, message }}
 */
function validateCancel(body) {
  const cancelled = body?.cancelled;
  if (typeof cancelled !== 'boolean') {
    return fail('cancelled muss true oder false sein.');
  }

  if (!cancelled) return { ok: true, cancelled: false, reason: null };

  const reason = cleanText(body?.reason, {
    label: 'Der Grund der Absage',
    max: MAX_REASON_LENGTH,
  });
  if (!reason.ok) {
    return fail('Bitte einen kurzen Grund für die Absage angeben.');
  }
  return { ok: true, cancelled: true, reason: reason.value };
}

/** `scope`-Query-Parameter für Bearbeiten/Löschen. */
function validateScope(value) {
  const scope = value ?? 'single';
  if (scope !== 'single' && scope !== 'series') {
    return fail('Ungültiger Bereich. Erlaubt: single, series.');
  }
  return { ok: true, scope };
}

// --- Anwesenheiten ----------------------------------------------------------

/**
 * Prüft den Body für POST /api/attendances/respond.
 *
 * Kernregel des Moduls: eine Absage OHNE Grund wird abgewiesen.
 *
 * @returns {{ ok:true, eventId:number, userId:number|null,
 *             status:string, reason:string|null } | { ok:false, ... }}
 */
function validateRespond(body) {
  const eventId = Number(body?.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return fail('Ungültige Termin-ID.');
  }

  const status = body?.status;
  if (!ATTENDANCE_STATUS.includes(status)) {
    return fail(
      `Ungültiger Status. Erlaubt: ${ATTENDANCE_STATUS.join(', ')}.`
    );
  }

  // Optional: für wen wird eingetragen? Nur Trainer:innen dürfen das – die
  // Berechtigung prüft der Controller.
  let userId = null;
  if (body?.userId !== undefined && body?.userId !== null) {
    userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return fail('Ungültige Benutzer-ID.');
    }
  }

  if (status === 'DECLINED') {
    const reason = cleanText(body?.reason, {
      label: 'Der Grund der Abmeldung',
      max: MAX_REASON_LENGTH,
    });
    if (!reason.ok) {
      return fail('Bitte einen Grund für die Abmeldung angeben.');
    }
    return { ok: true, eventId, userId, status, reason: reason.value };
  }

  // Zusage: ein mitgeschickter Grund wäre irreführend -> verwerfen.
  return { ok: true, eventId, userId, status, reason: null };
}

// --- Dauerhafte Abwesenheiten ----------------------------------------------

/**
 * Prüft den Body für POST /api/absences/long-term.
 * @returns {{ ok:true, fields:object } | { ok:false, ... }}
 */
function validateAbsence(body) {
  const type = body?.type;
  if (!ABSENCE_TYPES.includes(type)) {
    return fail(`Ungültige Art. Erlaubt: ${ABSENCE_TYPES.join(', ')}.`);
  }

  const startDate = parseDate(body?.startDate);
  const endDate = parseDate(body?.endDate);
  if (!startDate || !endDate) {
    return fail('Bitte ein gültiges Start- und Enddatum angeben.');
  }
  if (daysBetween(startDate, endDate) < 0) {
    return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
  }
  if (daysBetween(startDate, endDate) > MAX_SERIES_DAYS) {
    return fail(
      `Ein Zeitraum darf höchstens ${MAX_SERIES_DAYS} Tage umfassen.`
    );
  }

  const note = cleanText(body?.note, {
    label: 'Die Notiz',
    max: MAX_NOTE_LENGTH,
    required: false,
  });
  if (!note.ok) return note;

  // NULL = gilt für alle Mannschaften der Person (Normalfall bei Verletzung).
  let teamId = null;
  if (body?.teamId !== undefined && body?.teamId !== null && body?.teamId !== '') {
    teamId = Number(body.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return fail('Ungültige Mannschafts-ID.');
    }
  }

  // `user_id` und `created_at` setzt der Controller bzw. die Datenbank.
  return {
    ok: true,
    fields: {
      team_id: teamId,
      type,
      start_date: startDate,
      end_date: endDate,
      note: note.value,
    },
  };
}

// --- Zeiträume --------------------------------------------------------------

/**
 * `from`/`to` aus der Query. Beide optional – fehlende Werte füllt der
 * Controller mit seinem fachlichen Standard.
 *
 * @returns {{ ok:true, from:string|null, to:string|null } | { ok:false, ... }}
 */
function validateRange(query) {
  const from = query?.from === undefined ? null : parseDate(query.from);
  const to = query?.to === undefined ? null : parseDate(query.to);

  if (query?.from !== undefined && !from) {
    return fail('Ungültiges Startdatum (erwartet JJJJ-MM-TT).');
  }
  if (query?.to !== undefined && !to) {
    return fail('Ungültiges Enddatum (erwartet JJJJ-MM-TT).');
  }
  if (from && to && daysBetween(from, to) < 0) {
    return fail('Das Enddatum darf nicht vor dem Startdatum liegen.');
  }
  if (from && to && daysBetween(from, to) > MAX_RANGE_DAYS) {
    return fail(
      `Der Zeitraum darf höchstens ${MAX_RANGE_DAYS} Tage umfassen.`
    );
  }

  return { ok: true, from, to };
}

module.exports = {
  MAX_TITLE_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_REASON_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_RANGE_DAYS,
  parseDate,
  parseDateTime,
  daysBetween,
  validateEventCreate,
  validateEventUpdate,
  validateCancel,
  validateScope,
  validateRespond,
  validateAbsence,
  validateRange,
};
