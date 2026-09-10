// Verwaltungs-Controller (/api/admin/*).
//
// Kein SQL in dieser Datei – Datenzugriff über userRepository, Eingabe-Prüfung
// über utils/validation. Diese Datei enthält nur noch die Geschäftsregeln:
//   - Rolle & Freigabe ändern:            admin, sub_admin
//   - Spieler-Mannschaften & Dienste:     zusätzlich trainer
//   - sub_admin darf admin-Konten NICHT bearbeiten und NICHT zum admin machen
//   - niemand sperrt sich selbst aus; der letzte aktive admin bleibt erhalten
const userRepository = require('../repositories/userRepository');
const teamRepository = require('../repositories/teamRepository');
const {
  validateUserPatch,
  validateTeamCreate,
  parseId,
} = require('../utils/validation');
const { ADMIN_ROLES, ROLES } = require('../utils/roles');

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

// GET /api/admin/users?search=&role=&status=&page=&pageSize=
//
// Seitenweise statt am Stück: die Verwaltung soll auch bei über tausend
// Konten flüssig bleiben. Gefiltert wird in SQL (siehe
// userRepository.listPageWithProfiles), nicht im Browser.
async function listUsers(req, res, next) {
  try {
    const { search, role, status } = req.query;

    if (role !== undefined && role !== '' && !ROLES.includes(role)) {
      return res.status(400).json({ message: 'Ungültige Rolle im Filter.' });
    }
    if (status !== undefined && status !== '' && !['active', 'inactive'].includes(status)) {
      return res
        .status(400)
        .json({ message: 'Ungültiger Status im Filter. Erlaubt: active, inactive.' });
    }

    const result = await userRepository.listPageWithProfiles({
      search: typeof search === 'string' ? search.trim().slice(0, MAX_SEARCH_LENGTH) : undefined,
      role: role || undefined,
      status: status || undefined,
      page: readNumber(req.query.page, 1),
      pageSize: readNumber(req.query.pageSize, DEFAULT_PAGE_SIZE, {
        min: 1,
        max: MAX_PAGE_SIZE,
      }),
    });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
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
async function updateUser(req, res, next) {
  try {
    const userId = parseId(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const actorRole = req.userRole;
    const canManageAccounts = ADMIN_ROLES.includes(actorRole);
    const isSubAdmin = actorRole === 'sub_admin';

    const { role, isApproved } = req.body || {};

    // Trainer:innen dürfen ausschliesslich Mannschaften/Dienste ändern.
    if (!canManageAccounts && (role !== undefined || isApproved !== undefined)) {
      return res
        .status(403)
        .json({ message: 'Nur Admins dürfen Rolle oder Freigabe ändern.' });
    }

    const patch = await validateUserPatch(req.body);
    if (!patch.ok) {
      return res.status(patch.status).json({ message: patch.message });
    }

    // sub_admin darf die Rolle "admin" nicht vergeben.
    if (isSubAdmin && patch.raw.role === 'admin') {
      return res.status(403).json({
        message:
          'Sub-Admins dürfen die Rolle „Admin“ nicht vergeben. Bitte einen Admin beauftragen.',
      });
    }

    const target = await userRepository.findById(userId);
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    // sub_admin darf admin-Konten überhaupt nicht anfassen.
    if (isSubAdmin && target.role === 'admin') {
      return res
        .status(403)
        .json({ message: 'Sub-Admins dürfen Admin-Konten nicht bearbeiten.' });
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

    // Es muss immer mindestens ein aktiver Admin übrig bleiben.
    const losesAdmin =
      (patch.raw.role !== undefined && patch.raw.role !== 'admin') ||
      patch.raw.isApproved === false;
    if (losesAdmin && target.role === 'admin') {
      const activeAdmins = await userRepository.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(409).json({
          message:
            'Der letzte aktive Admin kann nicht herabgestuft oder gesperrt werden.',
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

// GET /api/admin/teams
//
// Wie /api/teams, aber mit Mitgliederzahlen je Mannschaft – die braucht die
// Verwaltungstabelle, die öffentliche Auswahlliste nicht.
async function listTeams(req, res, next) {
  try {
    const teams = await teamRepository.listAllWithCounts();
    return res.json({ teams });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/teams
//   Body: { name, code, ageGroup?, gender?, sortOrder?, handballTeamId? }
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

    const fields = { ...check.fields };
    // Ohne ausdrückliche Sortierung hinten anhängen.
    if (fields.sort_order === undefined) {
      fields.sort_order = await teamRepository.nextSortOrder();
    }

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
      team: { ...team, id: team?.id ?? teamId },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, getUserStats, updateUser, listTeams, createTeam };
