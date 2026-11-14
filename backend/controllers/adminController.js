// Verwaltungs-Controller (/api/admin/*).
//
// Kein SQL in dieser Datei – Datenzugriff über userRepository, Eingabe-Prüfung
// über utils/validation. Wer was darf, entscheiden Rechte (access/permissions.js)
// und die Regeln gegen Rechte-Ausweitung (access/rules.js).
const bcrypt = require('bcrypt');

const { SALT_ROUNDS } = require('../config/auth');
const userRepository = require('../repositories/userRepository');
const teamRepository = require('../repositories/teamRepository');
const {
  validateUserPatch,
  validateTeamCreate,
  parseId,
  checkPassword,
} = require('../utils/validation');
const accessService = require('../access/service');
const accessRepository = require('../access/repository');
const rules = require('../access/rules');

const { can } = accessService;
const { publicUrlFor } = require('../config/uploads');

// Seitengröße der Mitgliedertabelle. Der Client darf sie wählen, aber nur
// innerhalb dieser Grenzen – sonst holt ein `?pageSize=100000` doch wieder
// alle Konten auf einmal und die Paginierung wäre wirkungslos.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Freitextsuche: lang genug für jeden Namen, kurz genug, dass daraus kein
// teures LIKE über ein Megabyte wird.
const MAX_SEARCH_LENGTH = 100;

/** Ganzzahliger Query-Parameter mit Standardwert und Grenzen. */
function readNumber(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

// GET /api/admin/users?search=&role=&status=&teamId=&teamless=&page=&pageSize=
//
// Seitenweise statt am Stück: die Verwaltung soll auch bei über tausend
// Konten flüssig bleiben. Gefiltert wird in SQL (siehe
// userRepository.listPageWithProfiles), nicht im Browser.
async function listUsers(req, res, next) {
  try {
    const { search, role, status } = req.query;

    if (role !== undefined && role !== '' && !/^[a-z][a-z0-9_]{1,39}$/.test(role)) {
      return res.status(400).json({ message: 'Ungültige Rolle im Filter.' });
    }
    if (status !== undefined && status !== '' && !['active', 'inactive'].includes(status)) {
      return res
        .status(400)
        .json({ message: 'Ungültiger Status im Filter. Erlaubt: active, inactive.' });
    }
    const teamId = req.query.teamId ? parseId(req.query.teamId) : undefined;
    if (req.query.teamId && !teamId) {
      return res.status(400).json({ message: 'Ungültige Mannschaft im Filter.' });
    }

    const result = await userRepository.listPageWithProfiles({
      search: typeof search === 'string' ? search.trim().slice(0, MAX_SEARCH_LENGTH) : undefined,
      role: role || undefined,
      status: status || undefined,
      teamId,
      teamless: req.query.teamless === '1',
      page: readNumber(req.query.page, 1),
      pageSize: readNumber(req.query.pageSize, DEFAULT_PAGE_SIZE, {
        min: 1,
        max: MAX_PAGE_SIZE,
      }),
    });

    // Zusatzrollen (Migration 019) für genau diese Seite nachladen.
    try {
      const extra = await accessRepository.getExtraRolesFor(result.users.map((u) => u.id));
      result.users = result.users.map((u) => ({ ...u, extraRoles: extra.get(u.id) ?? [] }));
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    // Kontaktdaten aller Mitglieder nur mit eigenem Recht. Trainer:innen
    // bekommen den Kontakt ihres Kaders auf der Mannschaftsseite.
    if (!can(req, 'members.contact')) {
      result.users = result.users.map(withoutContact);
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

function withoutContact(profile) {
  return { ...profile, email: null, phone: null };
}

/**
 * Welche Mannschaften ändert diese Spieler-Zuordnung? Hinzugekommene und
 * entfernte zusammen – nur die muss jemand verantworten dürfen.
 */
function changedTeamIds(currentIds, nextIds) {
  const current = new Set(currentIds);
  const next = new Set(nextIds);
  return [
    ...nextIds.filter((id) => !current.has(id)),
    ...currentIds.filter((id) => !next.has(id)),
  ];
}

// GET /api/admin/users/stats
//
// Kennzahlen für den Kopf der Mitgliederverwaltung. Bewusst getrennt von der
// Liste: die Zahlen beziehen sich auf den GESAMTEN Verein und dürfen sich
// nicht ändern, nur weil gerade ein Filter aktiv ist.
async function getUserStats(req, res, next) {
  try {
    const stats = await userRepository.getMemberStats();
    return res.json({ stats });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/users/:id   Body: role?, isApproved?, teamIds?, services?
//
//   role        Grundrolle            -> members.roles (+ Regeln aus access/rules)
//   isApproved  Sperre                -> members.lock
//   services    Helferdienste         -> members.edit
//   teamIds     Spieler-Mannschaften  -> members.edit, oder als Trainer:in nur
//                                        in selbst trainierten Mannschaften
async function updateUser(req, res, next) {
  try {
    const userId = parseId(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const body = req.body || {};
    if (body.role !== undefined && !can(req, 'members.roles')) {
      return res.status(403).json({ message: 'Dir fehlt das Recht „Rollen zuweisen“.' });
    }
    if (body.isApproved !== undefined && !can(req, 'members.lock')) {
      return res.status(403).json({ message: 'Dir fehlt das Recht „Konten sperren“.' });
    }
    if (body.services !== undefined && !can(req, 'members.edit')) {
      return res.status(403).json({ message: 'Dir fehlt das Recht „Mitglieder bearbeiten“.' });
    }

    const patch = await validateUserPatch(body);
    if (!patch.ok) {
      return res.status(patch.status).json({ message: patch.message });
    }

    const target = await accessService.getAccess(userId);
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    const touchesAccount = patch.raw.role !== undefined || patch.raw.isApproved !== undefined;
    if (touchesAccount && !rules.canTouchTarget(req.access, target)) {
      return res.status(403).json({ message: 'Admin-Konten bearbeitet nur ein Admin.' });
    }

    // Selbst-Aussperrung verhindern.
    const isSelf = userId === req.userId;
    if (isSelf && patch.raw.role !== undefined && patch.raw.role !== target.role) {
      return res.status(400).json({
        message:
          'Die eigene Rolle kann nicht geändert werden. Bitte von einem anderen Admin ändern lassen.',
      });
    }
    if (isSelf && patch.raw.isApproved === false) {
      return res
        .status(400)
        .json({ message: 'Die eigene Freigabe kann nicht entzogen werden.' });
    }

    // Neue und alte Grundrolle müssen beide in den eigenen Rechten liegen.
    if (patch.raw.role !== undefined && patch.raw.role !== target.role) {
      const roles = await accessRepository
        .findRolesByKeys([patch.raw.role, target.role])
        .catch(() => []);
      if (roles.some((role) => !rules.canAssignRole(req.access, role))) {
        return res.status(403).json({
          message: 'Du kannst nur Rollen vergeben, deren Rechte du selbst hast.',
        });
      }
    }

    // Es muss immer mindestens ein aktiver Admin übrig bleiben.
    if (target.isSuperuser && (patch.raw.isApproved === false || patch.raw.role !== undefined)) {
      let staysSuper = patch.raw.isApproved !== false;
      if (staysSuper && patch.raw.role !== undefined) {
        const grants = await accessRepository.getUserGrants(userId).catch(() => ({ extraRoles: [] }));
        const roles = await accessRepository
          .findRolesByKeys([patch.raw.role, ...grants.extraRoles])
          .catch(() => []);
        staysSuper = roles.some((role) => role.isSuperuser) || patch.raw.role === 'admin';
      }
      if (!staysSuper && (await rules.wouldLoseLastSuperuser(target).catch(() => false))) {
        return res.status(409).json({
          message: 'Der letzte aktive Admin kann nicht herabgestuft oder gesperrt werden.',
        });
      }
    }

    // Ohne members.edit nur in selbst trainierten Mannschaften – sonst könnte
    // jede:r Trainer:in fremde Kader umbauen.
    if (!can(req, 'members.edit') && patch.playerTeamIds !== undefined) {
      const [actorTeams, targetTeams] = await Promise.all([
        teamRepository.getTeamsForUser(req.userId),
        teamRepository.getTeamsForUser(userId),
      ]);
      const coached = new Set(
        actorTeams
          .filter((t) => t.relationType === 'coach' && t.isConfirmed)
          .map((t) => t.id)
      );
      const currentPlayerIds = targetTeams
        .filter((t) => t.relationType === 'player')
        .map((t) => t.id);
      const touched = changedTeamIds(currentPlayerIds, patch.playerTeamIds);
      if (touched.some((id) => !coached.has(id))) {
        return res.status(403).json({
          message: 'Du kannst nur Mannschaften ändern, die du selbst trainierst.',
        });
      }
    }

    await userRepository.applyAdminChange(userId, {
      accountFields: patch.accountFields,
      playerTeamIds: patch.playerTeamIds,
      services: patch.services,
    });

    return res.json({ message: 'Benutzer aktualisiert.' });
  } catch (err) {
    return next(err);
  }
}

// --- Mannschaften -----------------------------------------------------------

/**
 * Mannschaft für die Ausgabe aufbereiten: der gespeicherte Foto-Pfad wird zur
 * abrufbaren URL, der interne Dateipfad verlässt den Server nicht.
 *
 * Gleiche Regel wie in teamsController.presentTeam. Sie hier zu wiederholen
 * ist billiger als das Risiko, dass die beiden Team-Endpunkte unterschiedlich
 * geformte Objekte liefern – das Frontend nutzt beide.
 */
function presentTeam(team) {
  if (!team) return null;
  const { photoPath, ...rest } = team;
  return { ...rest, photoUrl: publicUrlFor(photoPath) };
}


// GET /api/admin/teams
//
// Wie /api/teams, aber mit Mitgliederzahlen je Mannschaft – die braucht die
// Verwaltungstabelle, die öffentliche Auswahlliste nicht.
async function listTeams(req, res, next) {
  try {
    const teams = await teamRepository.listAllWithCounts();
    return res.json({ teams: teams.map(presentTeam) });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/teams
//   Body: { name, code, ageGroup?, gender?, handballTeamId? }
//
// Legt eine neue Mannschaft an. `handballTeamId` ist die nuLiga-Nummer
// (`teamtable`) – ist sie gesetzt, holen sich Tabelle, Spielplan und
// Live-Ticker der Mannschaftsseite ihre Daten ab sofort von selbst.
async function createTeam(req, res, next) {
  try {
    const check = validateTeamCreate(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    // Die Anzeigereihenfolge vergibt der Server: neue Mannschaften hängen
    // hinten an. `sort_order` ist ein interner Sortierschlüssel und taucht in
    // keinem Formular auf.
    const fields = { ...check.fields, sort_order: await teamRepository.nextSortOrder() };

    let teamId;
    try {
      teamId = await teamRepository.createTeam(fields);
    } catch (err) {
      // Der UNIQUE-Index auf `code` ist die verlässliche Prüfung – er greift
      // auch dann, wenn zwei Admins gleichzeitig dasselbe Kürzel anlegen.
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message: `Das Kürzel „${fields.code}“ ist bereits vergeben.`,
        });
      }
      throw err;
    }

    const team = await teamRepository.findByCode(fields.code);
    return res.status(201).json({
      message: `Mannschaft „${fields.name}“ angelegt.`,
      team: { ...presentTeam(team), id: team?.id ?? teamId },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/users/:id/password   Body: { newPassword }
//
// Passwort-Notfall: Jemand hat sein Passwort vergessen. Darf AUSSCHLIESSLICH
// ein Admin (Superuser-Rolle) – kein Einzelrecht, keine Zusatzrolle. Wer das
// kann, kann jedes Konto übernehmen; das gehört in die Hand weniger.
// Alle bisherigen Sitzungen der Person enden (sessions_valid_from).
async function resetUserPassword(req, res, next) {
  try {
    if (!req.access?.isSuperuser) {
      return res.status(403).json({ message: 'Passwörter anderer Mitglieder setzt nur ein Admin.' });
    }
    const userId = parseId(req.params.id);
    if (!userId) return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    if (userId === req.userId) {
      return res.status(400).json({ message: 'Dein eigenes Passwort änderst du unter „Mein Konto“.' });
    }
    const target = await accessService.getAccess(userId);
    if (!target) return res.status(404).json({ message: 'Benutzer nicht gefunden.' });

    const check = checkPassword(req.body?.newPassword, 'Das neue Passwort');
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    const passwordHash = await bcrypt.hash(req.body.newPassword, SALT_ROUNDS);
    await userRepository.updatePassword(userId, passwordHash);
    console.log(`Admin ${req.userId} hat das Passwort von Konto ${userId} neu gesetzt.`);

    return res.json({
      message: 'Neues Passwort gesetzt. Die Person ist auf allen Geräten abgemeldet und meldet sich mit dem neuen Passwort an.',
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, getUserStats, updateUser, resetUserPassword, listTeams, createTeam };
