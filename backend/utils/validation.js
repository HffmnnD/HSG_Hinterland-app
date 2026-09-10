// Eingabe-Prüfung für die Controller.
//
// Jede Funktion gibt entweder
//   { ok: true, ...aufbereitete Werte }
// oder
//   { ok: false, status: <HTTP-Code>, message: '<für den Client>' }
// zurück. Kein Zugriff auf `req`/`res`, keine Seiteneffekte ausser
// Lese-Abfragen zur Existenzprüfung (über teamRepository).
const teamRepository = require('../repositories/teamRepository');
const { ROLES, RELATION_TYPES, SERVICE_TYPES } = require('./roles');

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

/**
 * Prüft den PATCH-Body für /api/teams/:code (Stammdaten der Mannschaft).
 *
 * Aktuell nur `handballTeamId`. Leerstring oder null hebt die Ligaverknüpfung
 * wieder auf – die Mannschaftsseite zeigt dann den Hinweis, dass keine
 * Ligaspiele terminiert sind.
 *
 * @returns {{ ok:true, fields: object } | { ok:false, status, message }}
 */
function validateTeamPatch(body) {
  const { handballTeamId } = body || {};
  const fields = {};

  if (handballTeamId !== undefined) {
    if (handballTeamId === null || handballTeamId === '') {
      fields.handball_team_id = null;
    } else if (
      typeof handballTeamId !== 'string' ||
      !HANDBALL_TEAM_ID_PATTERN.test(handballTeamId.trim())
    ) {
      return fail(
        'Ungültige nuLiga-Nummer. Erwartet wird die Zahl aus der Adresse der Mannschaftsseite, z. B. 2086554.'
      );
    } else {
      fields.handball_team_id = handballTeamId.trim();
    }
  }

  if (Object.keys(fields).length === 0) {
    return fail('Keine Änderungen übergeben (handballTeamId).');
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

/**
 * Ausführliche Form `teams: [{ teamId, relationType }]`.
 * @returns {Promise<{ ok:true, relations: {teamId:number, relationType:string}[] | undefined }
 *                  | { ok:false, ... }>}
 */
async function validateTeamRelations(teams) {
  if (teams === undefined) return { ok: true, relations: undefined };
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
    if (!isRelationType(relationType)) {
      return fail(
        `Ungültiger Beziehungstyp. Erlaubt: ${RELATION_TYPES.join(', ')}.`
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

// --- Registrierung -------------------------------------------------------

/**
 * Prüft den kompletten Registrierungs-Body.
 * @returns {Promise<{ ok:true,
 *                     account: { firstName, lastName, email, password },
 *                     relations: {teamId, relationType}[],
 *                     services: string[] }
 *                  | { ok:false, ... }>}
 */
async function validateRegistration(body) {
  const { firstName, lastName, email, password, teams, teamIds, services } =
    body || {};

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
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(
      `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
    );
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) {
    return fail(
      `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`
    );
  }

  // Mannschaften: bevorzugt `teams`, sonst Kurzform `teamIds` (alles -> player).
  let relations = [];
  if (teams !== undefined) {
    const check = await validateTeamRelations(teams);
    if (!check.ok) return check;
    relations = check.relations ?? [];
  } else if (teamIds !== undefined) {
    const check = await validateTeamIdList(teamIds);
    if (!check.ok) return check;
    relations = (check.ids ?? []).map((teamId) => ({
      teamId,
      relationType: 'player',
    }));
  }

  const serviceCheck = validateServiceList(services);
  if (!serviceCheck.ok) return serviceCheck;

  return {
    ok: true,
    account: {
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: normalizedEmail,
      password,
    },
    relations,
    services: serviceCheck.services ?? [],
  };
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

module.exports = {
  MAX_NEWS_TITLE_LENGTH,
  MAX_NEWS_CONTENT_LENGTH,
  MIN_JERSEY,
  MAX_JERSEY,
  parseId,
  isRelationType,
  validateTeamPatch,
  validateRosterPatch,
  validateServiceList,
  validateTeamIdList,
  validateTeamRelations,
  validateRegistration,
  validateUserPatch,
  validateNewsPost,
};
