// Eingabe-Prüfung für die Controller.
//
// Jede Funktion gibt entweder
//   { ok: true, ...aufbereitete Werte }
// oder
//   { ok: false, status: <HTTP-Code>, message: '<für den Client>' }
// zurück. Kein Zugriff auf `req`/`res`, keine Seiteneffekte ausser
// Lese-Abfragen zur Existenzprüfung (über teamRepository).
const teamRepository = require('../repositories/teamRepository');
const {
  ROLES,
  RELATION_TYPES,
  SELF_RELATION_TYPES,
  SERVICE_TYPES,
  THEMES,
} = require('./roles');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt beachtet nur die ersten 72 Bytes -> längere Eingaben ablehnen.
const MAX_PASSWORD_LENGTH = 72;
// News: müssen zu den Spaltenbreiten in `news` passen (VARCHAR(150) / TEXT).
const MAX_NEWS_TITLE_LENGTH = 150;
const MAX_NEWS_CONTENT_LENGTH = 5000;

const fail = (message, status = 400) => ({ ok: false, status, message });

/** Positive Ganzzahl aus einem Routen-Parameter. null wenn ungültig. */
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isRelationType(value) {
  return RELATION_TYPES.includes(value);
}

// --- Mannschaftsseite -------------------------------------------------------

// nuLiga-Mannschaftsnummer (`teamtable`): rein numerisch, siehe
// config/handball.js. Hier bewusst dieselbe Regel, damit gar nicht erst ein
// unbrauchbarer Wert in der Datenbank landet.
const HANDBALL_TEAM_ID_PATTERN = /^\d{1,12}$/;

// Rückennummern im Handball: 1-99 (die 0 ist nicht vorgesehen).
const MIN_JERSEY = 1;
const MAX_JERSEY = 99;
const MAX_STAFF_TITLE_LENGTH = 60;

// Mannschafts-Stammdaten (Spaltenbreiten in `teams`).
const MAX_TEAM_NAME_LENGTH = 100;
const MAX_TEAM_CODE_LENGTH = 20;
const MAX_AGE_GROUP_LENGTH = 40;
// Kuerzel landen in der URL (/teams/:code) und in Chips: Buchstaben, Ziffern
// und Bindestrich reichen dafuer und ersparen jedes Escaping.
const TEAM_CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;

/**
 * nuLiga-Nummer prüfen. Leerstring/null hebt die Ligaverknüpfung auf – die
 * Mannschaftsseite zeigt dann den Hinweis, dass keine Ligaspiele terminiert
 * sind.
 * @returns {{ ok:true, value:string|null } | { ok:false, ... }}
 */
function checkHandballTeamId(value) {
  // undefined = Feld nicht mitgeschickt, '' / null = bewusst geleert. Beides
  // landet als NULL in der Spalte.
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string' || !HANDBALL_TEAM_ID_PATTERN.test(value.trim())) {
    return fail(
      'Ungültige nuLiga-Nummer. Erwartet wird die Zahl aus der Adresse der Mannschaftsseite, z. B. 2086554.'
    );
  }
  return { ok: true, value: value.trim() };
}

/** Optionales Textfeld: getrimmt, längenbegrenzt, leer -> null. */
function checkOptionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') return fail(`${label} muss eine Zeichenkette sein.`);

  const clean = value.trim();
  if (clean.length > maxLength) {
    return fail(`${label} darf höchstens ${maxLength} Zeichen lang sein.`);
  }
  return { ok: true, value: clean.length > 0 ? clean : null };
}

/** Geschlecht der Mannschaft (ENUM `teams.gender`). Leer -> null. */
function checkGender(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (!teamRepository.GENDERS.includes(value)) {
    return fail(`Ungültiges Geschlecht. Erlaubt: ${teamRepository.GENDERS.join(', ')}.`);
  }
  return { ok: true, value };
}

/**
 * Prüft den POST-Body für /api/admin/teams (neue Mannschaft).
 *
 * Pflicht sind Name und Kürzel – alles andere lässt sich später nachtragen.
 * Das Kürzel wird auf Großbuchstaben normalisiert, weil es in der URL steht
 * und `findByCode` ebenfalls gross vergleicht.
 *
 * @returns {{ ok:true, fields: object } | { ok:false, status, message }}
 */
function validateTeamCreate(body) {
  const { name, code, ageGroup, gender, handballTeamId } = body || {};

  if (typeof name !== 'string' || name.trim().length === 0) {
    return fail('Bitte einen Namen für die Mannschaft angeben.');
  }
  const cleanName = name.trim();
  if (cleanName.length > MAX_TEAM_NAME_LENGTH) {
    return fail(`Der Name darf höchstens ${MAX_TEAM_NAME_LENGTH} Zeichen lang sein.`);
  }

  if (typeof code !== 'string' || code.trim().length === 0) {
    return fail('Bitte ein Kürzel angeben, z. B. „MJC“.');
  }
  const cleanCode = code.trim().toUpperCase();
  if (!TEAM_CODE_PATTERN.test(cleanCode)) {
    return fail(
      `Das Kürzel darf nur Buchstaben, Ziffern und Bindestriche enthalten (2–${MAX_TEAM_CODE_LENGTH} Zeichen), z. B. „MJC“.`
    );
  }

  const fields = { name: cleanName, code: cleanCode };

  const ageCheck = checkOptionalText(ageGroup, MAX_AGE_GROUP_LENGTH, 'Die Altersklasse');
  if (!ageCheck.ok) return ageCheck;
  fields.age_group = ageCheck.value;

  const genderCheck = checkGender(gender);
  if (!genderCheck.ok) return genderCheck;
  fields.gender = genderCheck.value;

  // `sort_order` ist bewusst KEIN Eingabefeld: die Anzeigereihenfolge vergibt
  // der Controller selbst (nextSortOrder, Zehnerschritte). Sie ist ein
  // interner Sortierschlüssel, keine Angabe, die jemand pflegen müsste.

  const handballCheck = checkHandballTeamId(handballTeamId);
  if (!handballCheck.ok) return handballCheck;
  fields.handball_team_id = handballCheck.value;

  return { ok: true, fields };
}

/**
 * Prüft den PATCH-Body für /api/teams/:code (Stammdaten der Mannschaft).
 *
 * Jedes Feld ist einzeln optional; `code` bleibt bewusst unveränderlich – es
 * steht in Links, Lesezeichen und in der Startseiten-Verknüpfung der PWA.
 *
 * @returns {{ ok:true, fields: object } | { ok:false, status, message }}
 */
function validateTeamPatch(body) {
  const { name, ageGroup, gender, handballTeamId } = body || {};
  const fields = {};

  if (handballTeamId !== undefined) {
    const check = checkHandballTeamId(handballTeamId);
    if (!check.ok) return check;
    fields.handball_team_id = check.value;
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return fail('Der Name darf nicht leer sein.');
    }
    if (name.trim().length > MAX_TEAM_NAME_LENGTH) {
      return fail(`Der Name darf höchstens ${MAX_TEAM_NAME_LENGTH} Zeichen lang sein.`);
    }
    fields.name = name.trim();
  }

  if (ageGroup !== undefined) {
    const check = checkOptionalText(ageGroup, MAX_AGE_GROUP_LENGTH, 'Die Altersklasse');
    if (!check.ok) return check;
    fields.age_group = check.value;
  }

  if (gender !== undefined) {
    const check = checkGender(gender);
    if (!check.ok) return check;
    fields.gender = check.value;
  }

  if (Object.keys(fields).length === 0) {
    return fail(
      'Keine Änderungen übergeben (name, ageGroup, gender oder handballTeamId).'
    );
  }
  return { ok: true, fields };
}

/**
 * Prüft den PATCH-Body für /api/teams/:code/members/:userId (Kaderangaben).
 *
 * Jedes Feld ist einzeln optional. `null` löscht den Wert bewusst – so lässt
 * sich eine Rückennummer auch wieder freigeben.
 *
 * @returns {{ ok:true, fields: object } | { ok:false, status, message }}
 */
function validateRosterPatch(body) {
  const { jerseyNumber, position, staffTitle } = body || {};
  const fields = {};

  if (jerseyNumber !== undefined) {
    if (jerseyNumber === null || jerseyNumber === '') {
      fields.jersey_number = null;
    } else {
      const number = Number(jerseyNumber);
      if (!Number.isInteger(number) || number < MIN_JERSEY || number > MAX_JERSEY) {
        return fail(
          `Die Rückennummer muss zwischen ${MIN_JERSEY} und ${MAX_JERSEY} liegen.`
        );
      }
      fields.jersey_number = number;
    }
  }

  if (position !== undefined) {
    if (position === null || position === '') {
      fields.position = null;
    } else if (!teamRepository.POSITIONS.includes(position)) {
      return fail(
        `Ungültige Position. Erlaubt: ${teamRepository.POSITIONS.join(', ')}.`
      );
    } else {
      fields.position = position;
    }
  }

  if (staffTitle !== undefined) {
    if (staffTitle === null || staffTitle === '') {
      fields.staff_title = null;
    } else if (typeof staffTitle !== 'string') {
      return fail('staffTitle muss eine Zeichenkette sein.');
    } else {
      const clean = staffTitle.trim();
      if (clean.length > MAX_STAFF_TITLE_LENGTH) {
        return fail(
          `Die Bezeichnung darf höchstens ${MAX_STAFF_TITLE_LENGTH} Zeichen lang sein.`
        );
      }
      fields.staff_title = clean.length > 0 ? clean : null;
    }
  }

  if (Object.keys(fields).length === 0) {
    return fail('Keine Änderungen übergeben (jerseyNumber, position, staffTitle).');
  }
  return { ok: true, fields };
}

// --- Helferdienste -------------------------------------------------------

/**
 * @returns {{ ok:true, services: string[] | undefined } | { ok:false, ... }}
 *   `services === undefined` -> Feld war nicht im Request.
 */
function validateServiceList(services) {
  if (services === undefined) return { ok: true, services: undefined };
  if (!Array.isArray(services)) return fail('services muss eine Liste sein.');

  const unique = [...new Set(services)];
  if (unique.some((s) => !SERVICE_TYPES.includes(s))) {
    return fail(`Ungültiger Helferdienst. Erlaubt: ${SERVICE_TYPES.join(', ')}.`);
  }
  return { ok: true, services: unique };
}

// --- Mannschafts-Zuordnungen -------------------------------------------------

/**
 * Kurzform `teamIds: [1, 2]` (immer Beziehungstyp `player`).
 * @returns {Promise<{ ok:true, ids: number[] | undefined } | { ok:false, ... }>}
 */
async function validateTeamIdList(teamIds) {
  if (teamIds === undefined) return { ok: true, ids: undefined };
  if (!Array.isArray(teamIds)) return fail('teamIds muss eine Liste sein.');

  const ids = [...new Set(teamIds.map((v) => Number(v)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return fail('Ungültige Mannschafts-ID.');
  }
  if (ids.length === 0) return { ok: true, ids: [] };

  const existing = await teamRepository.findExistingIds(ids);
  if (existing.length !== ids.length) {
    return fail('Mindestens eine Mannschaft existiert nicht.');
  }
  return { ok: true, ids };
}

// --- Registrierung -------------------------------------------------------

/**
 * Prüft den Registrierungs-Body.
 *
 * Bewusst NUR vier Felder: Vorname, Nachname, E-Mail, Passwort. Mannschaften,
 * Beteiligung und Helferdienste standen früher ebenfalls hier – sie machten
 * aus dem ersten Kontakt mit der App ein Formular mit vier Abschnitten, das
 * viele abgebrochen haben. Diese Angaben fragt jetzt der Onboarding-Assistent
 * nach der Freigabe ab (siehe validateOnboarding), wo sie hingehören: dort
 * sieht man die Mannschaften und kann sie in Ruhe wählen.
 *
 * Mitgeschickte Zusatzfelder werden ignoriert – ein älterer Client soll keine
 * Fehlermeldung bekommen, seine Mannschaftswahl aber auch nicht still an der
 * Bestätigung durch die Trainer:innen vorbeischmuggeln.
 *
 * @returns {Promise<{ ok:true,
 *                     account: { firstName, lastName, email, password } }
 *                  | { ok:false, ... }>}
 */
async function validateRegistration(body) {
  const { firstName, lastName, email, password } = body || {};

  if (!firstName || !lastName || !email || !password) {
    return fail('firstName, lastName, email und password sind erforderlich.');
  }
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return fail('Alle Felder müssen Zeichenketten sein.');
  }

  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (
    cleanFirstName.length === 0 ||
    cleanFirstName.length > MAX_NAME_LENGTH ||
    cleanLastName.length === 0 ||
    cleanLastName.length > MAX_NAME_LENGTH
  ) {
    return fail(
      `Vor- und Nachname dürfen nicht leer und höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
    );
  }
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(normalizedEmail)) {
    return fail('Ungültige E-Mail-Adresse.');
  }

  const passwordCheck = checkPassword(password);
  if (!passwordCheck.ok) return passwordCheck;

  return {
    ok: true,
    account: {
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: normalizedEmail,
      password,
    },
  };
}

// --- Eigenes Konto: Design, Onboarding, Passwort ----------------------------

/** Gemeinsame Passwortregeln für Registrierung und Passwortwechsel. */
function checkPassword(password, label = 'Das Passwort') {
  if (typeof password !== 'string') {
    return fail(`${label} muss eine Zeichenkette sein.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`${label} muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  // bcrypt beachtet nur die ersten 72 Bytes – längere Eingaben würden
  // stillschweigend abgeschnitten.
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) {
    return fail(`${label} darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
  }
  return { ok: true, password };
}

// Telefonnummer: Ziffern, Leerzeichen, +, /, -, Klammern. Bewusst KEINE
// strenge Formatprüfung – eine Vereins-App ist nicht die Stelle, an der jemand
// erklärt bekommt, dass „0170 / 123 45 67" falsch geschrieben sei. Geprüft
// wird nur, dass nichts anderes als eine Nummer im Feld landet.
const PHONE_PATTERN = /^[0-9+()/\s.-]+$/;
const MIN_PHONE_LENGTH = 5;
const MAX_PHONE_LENGTH = 30;

/**
 * Freiwillige Telefonnummer. Leerstring/null löscht sie.
 * @returns {{ ok:true, phone:string|null } | { ok:false, ... }}
 */
function validatePhone(phone) {
  if (phone === undefined || phone === null || phone === '') {
    return { ok: true, phone: null };
  }
  if (typeof phone !== 'string') {
    return fail('Die Telefonnummer muss eine Zeichenkette sein.');
  }
  const clean = phone.trim();
  if (clean.length === 0) return { ok: true, phone: null };
  if (clean.length > MAX_PHONE_LENGTH) {
    return fail(
      `Die Telefonnummer darf höchstens ${MAX_PHONE_LENGTH} Zeichen lang sein.`
    );
  }
  if (!PHONE_PATTERN.test(clean)) {
    return fail(
      'Die Telefonnummer darf nur Ziffern, Leerzeichen und die Zeichen + ( ) / - enthalten.'
    );
  }
  // Nach der Zeichenprüfung: „12" ist keine Telefonnummer, aber auch kein
  // Tippfehler im Zeichensatz – dafür braucht es eine eigene Meldung.
  if (clean.replace(/\D/g, '').length < MIN_PHONE_LENGTH) {
    return fail('Die Telefonnummer sieht zu kurz aus.');
  }
  return { ok: true, phone: clean };
}

/**
 * Design-Vorliebe („system" | „light" | „dark").
 * @returns {{ ok:true, theme:string } | { ok:false, ... }}
 */
function validateTheme(theme) {
  if (!THEMES.includes(theme)) {
    return fail(`Ungültiges Design. Erlaubt: ${THEMES.join(', ')}.`);
  }
  return { ok: true, theme };
}

/**
 * Mannschafts-Zuordnungen, die jemand für SICH SELBST wählt – im
 * Onboarding-Assistenten und später unter „Mein Konto".
 *
 * Anders als validateTeamRelations (Verwaltung) sind hier nur die Beziehungen
 * erlaubt, die man selbst beantragen darf. Die Bestätigung durch die
 * Trainer:innen hängt davon nicht ab – die regelt die Datenschicht.
 *
 * @returns {Promise<{ ok:true, relations:{teamId:number, relationType:string}[] }
 *                  | { ok:false, ... }>}
 */
async function validateSelfRelations(teams) {
  if (teams === undefined || teams === null) return { ok: true, relations: [] };
  if (!Array.isArray(teams)) return fail('teams muss eine Liste sein.');

  const relations = [];
  const seen = new Set();

  for (const entry of teams) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return fail('Ungültiger Mannschaftseintrag.');
    }
    const teamId = Number(entry.teamId);
    const relationType = entry.relationType ?? 'player';

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return fail('Ungültige Mannschafts-ID.');
    }
    if (!SELF_RELATION_TYPES.includes(relationType)) {
      return fail(
        `Ungültiger Beziehungstyp. Erlaubt: ${SELF_RELATION_TYPES.join(', ')}.`
      );
    }

    const key = `${teamId}:${relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({ teamId, relationType });
  }

  if (relations.length === 0) return { ok: true, relations: [] };

  const ids = [...new Set(relations.map((r) => r.teamId))];
  const existing = await teamRepository.findExistingIds(ids);
  if (existing.length !== ids.length) {
    return fail('Mindestens eine Mannschaft existiert nicht.');
  }
  return { ok: true, relations };
}

/**
 * Prüft den Body des Onboarding-Abschlusses bzw. der späteren Änderung unter
 * „Mein Konto": gewählte Beteiligungen, Mannschaften und Design.
 *
 * @returns {Promise<{ ok:true, theme:string, phone:string|null,
 *                     relations:{teamId:number, relationType:string}[] }
 *                  | { ok:false, ... }>}
 */
async function validateOnboarding(body) {
  const { theme = 'system', phone, teams } = body || {};

  const themeCheck = validateTheme(theme);
  if (!themeCheck.ok) return themeCheck;

  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.ok) return phoneCheck;

  const relationCheck = await validateSelfRelations(teams);
  if (!relationCheck.ok) return relationCheck;

  return {
    ok: true,
    theme: themeCheck.theme,
    phone: phoneCheck.phone,
    relations: relationCheck.relations,
  };
}

/**
 * Prüft den Body des Passwortwechsels.
 * @returns {{ ok:true, currentPassword:string, newPassword:string } | { ok:false, ... }}
 */
function validatePasswordChange(body) {
  const { currentPassword, newPassword } = body || {};

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return fail('Bitte das aktuelle Passwort angeben.');
  }
  const check = checkPassword(newPassword, 'Das neue Passwort');
  if (!check.ok) return check;

  if (currentPassword === newPassword) {
    return fail('Das neue Passwort muss sich vom bisherigen unterscheiden.');
  }
  return { ok: true, currentPassword, newPassword };
}

// --- Admin: Konto-Änderung -------------------------------------------------

/**
 * Prüft den PATCH-Body für /api/admin/users/:id (nur Format/erlaubte Werte,
 * NICHT die Berechtigung – die macht der Controller).
 *
 * @returns {Promise<{ ok:true,
 *                     accountFields: { role?, is_approved? },
 *                     playerTeamIds: number[] | undefined,
 *                     services: string[] | undefined,
 *                     raw: { role, isApproved } }
 *                  | { ok:false, ... }>}
 */
async function validateUserPatch(body) {
  const { role, isApproved, teamIds, services } = body || {};
  const accountFields = {};

  if (role !== undefined) {
    if (!ROLES.includes(role)) return fail('Ungültige Rolle.');
    accountFields.role = role;
  }
  if (isApproved !== undefined) {
    if (typeof isApproved !== 'boolean') {
      return fail('isApproved muss true oder false sein.');
    }
    accountFields.is_approved = isApproved ? 1 : 0;
  }

  const teamCheck = await validateTeamIdList(teamIds);
  if (!teamCheck.ok) return teamCheck;

  const serviceCheck = validateServiceList(services);
  if (!serviceCheck.ok) return serviceCheck;

  if (
    Object.keys(accountFields).length === 0 &&
    teamCheck.ids === undefined &&
    serviceCheck.services === undefined
  ) {
    return fail(
      'Keine Änderungen übergeben (role, isApproved, teamIds oder services).'
    );
  }

  return {
    ok: true,
    accountFields,
    playerTeamIds: teamCheck.ids,
    services: serviceCheck.services,
    raw: { role, isApproved },
  };
}

// --- Mannschaftsfoto: Bildausschnitt ----------------------------------------

// Grenzen des Bannerausschnitts. Der Zoom endet bei dreifach – darüber wird
// jedes Mannschaftsfoto matschig, und zum „Heranzoomen an ein Gesicht" ist der
// Kopfbereich ohnehin nicht da.
const MIN_PHOTO_ZOOM = 100;
const MAX_PHOTO_ZOOM = 300;

/** Ganzzahl in einem Bereich. `null`/`undefined` -> Feld nicht mitgeschickt. */
function checkPercent(value, min, max, label) {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const number = Number(value);
  if (!Number.isFinite(number)) return fail(`${label} muss eine Zahl sein.`);
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) {
    return fail(`${label} muss zwischen ${min} und ${max} liegen.`);
  }
  return { ok: true, value: rounded };
}

/**
 * Prüft den Body für PATCH /api/teams/:code/photo/frame.
 *
 * Erwartet Prozentwerte statt Pixel: Der Kopfbereich ist auf dem Handy
 * schmaler als am Rechner, ein in Pixeln gespeicherter Ausschnitt säße dort
 * falsch. Prozent bleiben in jeder Breite richtig.
 *
 * @returns {{ ok:true, fields: object } | { ok:false, status, message }}
 */
function validatePhotoFrame(body) {
  const { focusX, focusY, zoom } = body || {};
  const fields = {};

  const x = checkPercent(focusX, 0, 100, 'Die waagerechte Position');
  if (!x.ok) return x;
  if (x.value !== undefined) fields.photo_focus_x = x.value;

  const y = checkPercent(focusY, 0, 100, 'Die senkrechte Position');
  if (!y.ok) return y;
  if (y.value !== undefined) fields.photo_focus_y = y.value;

  const z = checkPercent(zoom, MIN_PHOTO_ZOOM, MAX_PHOTO_ZOOM, 'Die Vergrößerung');
  if (!z.ok) return z;
  if (z.value !== undefined) fields.photo_zoom = z.value;

  if (Object.keys(fields).length === 0) {
    return fail('Keine Änderungen übergeben (focusX, focusY oder zoom).');
  }
  return { ok: true, fields };
}

// --- Vereins-News -----------------------------------------------------------

/**
 * Prüft den Body für POST /api/admin/news.
 *
 * Kommt als multipart/form-data an (Bild-Upload), daher sind alle Felder
 * Zeichenketten. Das Bild selbst prüft multer (Typ & Größe, siehe
 * config/uploads.js).
 *
 * @returns {{ ok:true, title:string, content:string } | { ok:false, ... }}
 */
function validateNewsPost(body) {
  const { title, content } = body || {};

  if (typeof title !== 'string' || typeof content !== 'string') {
    return fail('title und content sind erforderlich.');
  }

  const cleanTitle = title.trim();
  const cleanContent = content.trim();

  if (cleanTitle.length === 0) {
    return fail('Bitte eine Überschrift angeben.');
  }
  if (cleanTitle.length > MAX_NEWS_TITLE_LENGTH) {
    return fail(
      `Die Überschrift darf höchstens ${MAX_NEWS_TITLE_LENGTH} Zeichen lang sein.`
    );
  }
  if (cleanContent.length === 0) {
    return fail('Bitte einen Nachrichtentext angeben.');
  }
  if (cleanContent.length > MAX_NEWS_CONTENT_LENGTH) {
    return fail(
      `Der Nachrichtentext darf höchstens ${MAX_NEWS_CONTENT_LENGTH} Zeichen lang sein.`
    );
  }

  return { ok: true, title: cleanTitle, content: cleanContent };
}

/**
 * Prüft den PATCH-Body für /api/admin/news/:id (Archivieren/Zurückholen).
 * @returns {{ ok:true, isArchived:boolean } | { ok:false, ... }}
 */
function validateNewsArchivePatch(body) {
  const { isArchived } = body || {};
  if (typeof isArchived !== 'boolean') {
    return fail('isArchived muss true oder false sein.');
  }
  return { ok: true, isArchived };
}

module.exports = {
  MAX_NEWS_TITLE_LENGTH,
  MAX_NEWS_CONTENT_LENGTH,
  MIN_JERSEY,
  MAX_JERSEY,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAM_CODE_LENGTH,
  MAX_AGE_GROUP_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PHOTO_ZOOM,
  MAX_PHOTO_ZOOM,
  MAX_PHONE_LENGTH,
  parseId,
  isRelationType,
  validateTeamCreate,
  validateTeamPatch,
  validateRosterPatch,
  validatePhotoFrame,
  validateServiceList,
  validateTeamIdList,
  validateRegistration,
  validateTheme,
  validatePhone,
  validateSelfRelations,
  validateOnboarding,
  validatePasswordChange,
  validateUserPatch,
  validateNewsPost,
  validateNewsArchivePatch,
};
