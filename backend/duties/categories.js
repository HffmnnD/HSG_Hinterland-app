// Dienst-Kategorien – wer darf welchen Dienst übernehmen?
//
// Heute gibt es nur Helferdienste, die jedes Mitglied übernehmen darf. Eine
// neue Kategorie ist EIN Eintrag hier, ohne Migration (`duties.category` ist
// ein freier Schlüssel). Das Frontend bekommt die Liste über
// GET /api/duties (Feld `categories`) und bietet sie beim Anlegen an.
//
// `canTake(person)` bekommt { id, role, services } – `services` sind die
// Helferdienste aus `user_services` (z. B. 'zeitnehmer'), die die Verwaltung
// pflegt. Beispiel für später:
//
//   zeitnehmer: {
//     label: 'Zeitnehmer',
//     canTake: (person) =>
//       person.services.includes('zeitnehmer') ||
//       ['admin', 'sub_admin', 'trainer'].includes(person.role),
//   },

const CATEGORIES = {
  helfer: {
    label: 'Helferdienst',
    canTake: () => true,
  },
};

const DEFAULT_CATEGORY = 'helfer';

const isKnown = (key) => Object.prototype.hasOwnProperty.call(CATEGORIES, key);

/** Darf `person` Dienste dieser Kategorie übernehmen? Unbekannt = nein. */
function canTake(key, person) {
  return isKnown(key) && Boolean(CATEGORIES[key].canTake(person));
}

function label(key) {
  return isKnown(key) ? CATEGORIES[key].label : key;
}

/** Für das Frontend: [{ key, label }]. */
function list() {
  return Object.entries(CATEGORIES).map(([key, entry]) => ({ key, label: entry.label }));
}

module.exports = { DEFAULT_CATEGORY, isKnown, canTake, label, list };
