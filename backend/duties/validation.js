// Prüfung der Eingaben des Dienstplans. Rein (kein I/O).
const categories = require('./categories');
const config = require('./config');
const { parseDateTime } = require('../utils/scheduleValidation');
const { addMinutesToSql, nowSqlDateTime } = require('../utils/schedule');

const fail = (message, status = 400) => ({ ok: false, status, message });

/** Positive Ganzzahl aus einem Routen-Parameter. null wenn ungültig. */
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 4294967295 ? id : null;
}

/**
 * Text-Feld: getrimmt, Länge geprüft. `required` = darf nicht leer sein.
 * @returns {{ok:true, value:string|null} | {ok:false, ...}}
 */
function text(value, { name, max, required = false }) {
  if (value === undefined || value === null || value === '') {
    return required ? fail(`${name} fehlt.`) : { ok: true, value: null };
  }
  if (typeof value !== 'string') return fail(`${name} muss Text sein.`);
  // Steuerzeichen (außer Zeilenumbruch) haben in Titeln nichts verloren.
  const clean = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
  if (clean.length === 0) {
    return required ? fail(`${name} fehlt.`) : { ok: true, value: null };
  }
  if (clean.length > max) return fail(`${name} darf höchstens ${max} Zeichen haben.`);
  return { ok: true, value: clean };
}

/** Minuten zwischen zwei `YYYY-MM-DD HH:MM:SS`-Werten (Wanduhrzeit). */
function minutesBetween(startSql, endSql) {
  const toMs = (sql) => Date.parse(`${sql.replace(' ', 'T')}Z`);
  return (toMs(endSql) - toMs(startSql)) / 60000;
}

/**
 * Plan-Stammdaten. `partial` = nur Mitgeschicktes prüfen (Bearbeiten).
 * @returns {{ok:true, fields:object} | {ok:false, ...}}
 */
function validatePlanFields(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return fail('Ungültige Anfrage.');
  const fields = {};

  if (!partial || body.title !== undefined) {
    const title = text(body.title, {
      name: 'Titel',
      max: config.MAX_TITLE_LENGTH,
      required: true,
    });
    if (!title.ok) return title;
    fields.title = title.value;
  }
  if (!partial || body.location !== undefined) {
    const location = text(body.location, { name: 'Ort', max: config.MAX_LOCATION_LENGTH });
    if (!location.ok) return location;
    fields.location = location.value;
  }
  if (!partial || body.notes !== undefined) {
    const notes = text(body.notes, { name: 'Notiz', max: config.MAX_NOTES_LENGTH });
    if (!notes.ok) return notes;
    fields.notes = notes.value;
  }
  if (partial && Object.keys(fields).length === 0) return fail('Keine Änderungen übergeben.');
  return { ok: true, fields };
}

/**
 * Ein Dienst. `existing` beim Bearbeiten: fehlende Felder kommen von dort.
 * @returns {{ok:true, duty:{title,category,start_time,end_time,capacity}} | {ok:false,...}}
 */
function validateDuty(body, { existing = null, now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('Ungültiger Dienst.');
  }
  const partial = Boolean(existing);

  let title = existing?.title ?? null;
  if (!partial || body.title !== undefined) {
    const check = text(body.title, { name: 'Titel', max: config.MAX_TITLE_LENGTH, required: true });
    if (!check.ok) return check;
    title = check.value;
  }

  let category = existing?.category ?? categories.DEFAULT_CATEGORY;
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !categories.isKnown(body.category)) {
      return fail('Unbekannte Dienst-Art.');
    }
    category = body.category;
  }

  let start = existing ? existing.startTime.replace('T', ' ') : null;
  let end = existing ? existing.endTime.replace('T', ' ') : null;
  if (!partial || body.startTime !== undefined) {
    start = parseDateTime(body.startTime);
    if (!start) return fail('Ungültiger Beginn.');
  }
  if (!partial || body.endTime !== undefined) {
    end = parseDateTime(body.endTime);
    if (!end) return fail('Ungültiges Ende.');
  }
  const minutes = minutesBetween(start, end);
  if (minutes <= 0) return fail('Das Ende muss nach dem Beginn liegen.');
  if (minutes > config.MAX_DUTY_MINUTES) return fail('Ein Dienst darf höchstens 24 Stunden dauern.');

  const timeChanged =
    !existing || start !== existing.startTime.replace('T', ' ') || end !== existing.endTime.replace('T', ' ');
  if (timeChanged) {
    const nowSql = nowSqlDateTime(now);
    if (start < nowSql) return fail('Der Dienst darf nicht in der Vergangenheit liegen.');
    if (start > addMinutesToSql(nowSql, config.MAX_DAYS_AHEAD * 1440)) {
      return fail('Der Dienst liegt zu weit in der Zukunft.');
    }
  }

  let capacity = existing?.capacity ?? 1;
  if (!partial || body.capacity !== undefined) {
    const value = body.capacity === undefined ? 1 : body.capacity;
    if (!Number.isInteger(value) || value < 1 || value > config.MAX_CAPACITY) {
      return fail(`Personen je Dienst: 1 bis ${config.MAX_CAPACITY}.`);
    }
    capacity = value;
  }

  return { ok: true, duty: { title, category, start_time: start, end_time: end, capacity } };
}

/** Liste von Diensten (Anlegen, Vorlage). */
function validateDutyList(list, { now = new Date() } = {}) {
  if (!Array.isArray(list) || list.length === 0) return fail('Mindestens ein Dienst fehlt.');
  if (list.length > config.MAX_DUTIES_PER_REQUEST) {
    return fail(`Höchstens ${config.MAX_DUTIES_PER_REQUEST} Dienste auf einmal.`);
  }
  const duties = [];
  for (let i = 0; i < list.length; i += 1) {
    const check = validateDuty(list[i], { now });
    if (!check.ok) {
      return list.length > 1 ? fail(`Dienst ${i + 1}: ${check.message}`) : check;
    }
    duties.push(check.duty);
  }
  return { ok: true, duties };
}

/**
 * Zeitstempel vom Gerät. Wird nur gespeichert, nie ausgewertet – deshalb
 * führt ein kaputter Wert nicht zum Fehler, sondern zu null.
 * @returns {string|null} `YYYY-MM-DD HH:MM:SS.mmm` in UTC
 */
function parseClientTime(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Uhren gehen falsch, aber nicht um Jahre.
  if (Math.abs(ms - Date.now()) > 366 * 86400000) return null;
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

module.exports = {
  parseId,
  validatePlanFields,
  validateDuty,
  validateDutyList,
  parseClientTime,
};
