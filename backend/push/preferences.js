// Was jemand per Push bekommen möchte – Voreinstellungen und Prüfung.
//
// Gespeichert wird nur, was von der Voreinstellung abweicht ODER was jemand
// ausdrücklich gesetzt hat; gelesen wird immer „Voreinstellung + Gespeichertes".
// Kommt eine neue Kategorie dazu, reicht ein Eintrag in DEFAULTS – ohne
// Migration.
const { QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } = require('./config');

// Kategorie-Schlüssel -> an/aus. Die Texte dazu stehen im Frontend
// (frontend/src/push/PushSettings.jsx).
const DEFAULTS = {
  changes: true, // Absagen, Verlegungen, gestrichene Termine
  newEvents: true, // neue Termine und Trainingszeiten
  reminders: true, // Erinnerung vor dem Termin
  reminderHours: 24, // wie lange vorher
  declines: true, // nur Trainer:innen: kurzfristige Absagen
  requests: true, // nur Trainer:innen: Beitrittsanfragen
  roster: true, // Aufnahme in den Kader bestätigt
  news: true, // Vereins-News
  quietHours: true, // 22–7 Uhr ohne Ton
};

const REMINDER_HOURS = [1, 3, 24];
const BOOLEAN_KEYS = Object.keys(DEFAULTS).filter(
  (key) => typeof DEFAULTS[key] === 'boolean'
);

/** Gespeicherten JSON-Text (oder Objekt, je nach Treiber) lesen. */
function parseStored(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Voreinstellungen + Gespeichertes, unbekannte Schlüssel fallen weg. */
function resolve(raw) {
  const stored = parseStored(raw);
  const result = { ...DEFAULTS };
  for (const key of BOOLEAN_KEYS) {
    if (typeof stored[key] === 'boolean') result[key] = stored[key];
  }
  if (REMINDER_HOURS.includes(stored.reminderHours)) {
    result.reminderHours = stored.reminderHours;
  }
  return result;
}

/**
 * Teil-Update aus der Anfrage prüfen.
 * @returns {{ok:true, patch:object} | {ok:false, status:number, message:string}}
 */
function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, message: 'Ungültige Einstellungen.' };
  }
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (BOOLEAN_KEYS.includes(key)) {
      if (typeof value !== 'boolean') {
        return { ok: false, status: 400, message: `${key} muss true oder false sein.` };
      }
      patch[key] = value;
    } else if (key === 'reminderHours') {
      if (!REMINDER_HOURS.includes(value)) {
        return {
          ok: false,
          status: 400,
          message: `reminderHours erlaubt: ${REMINDER_HOURS.join(', ')}.`,
        };
      }
      patch[key] = value;
    } else {
      return { ok: false, status: 400, message: `Unbekannte Einstellung: ${key}.` };
    }
  }
  return { ok: true, patch };
}

/** Liegt `now` in der Ruhezeit (über Mitternacht)? */
function isQuietTime(now = new Date()) {
  const hour = now.getHours();
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

module.exports = { DEFAULTS, REMINDER_HOURS, resolve, validatePatch, isQuietTime };
