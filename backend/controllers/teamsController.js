// Mannschafts-Controller (/api/teams/*).
//
// Kein SQL in dieser Datei – Datenzugriff über teamRepository/userRepository.
//   GET  /api/teams                      öffentliche Mannschaftsliste
//   GET  /api/teams/:code                Infos + Kader (jede:r Angemeldete)
//   GET  /api/teams/:code/candidates     Auswahlliste zum Hinzufügen (Verwaltung)
//   POST /api/teams/:code/members        Zuordnung anlegen                (Verwaltung)
//   DEL  /api/teams/:code/members/:uid   Zuordnung entfernen              (Verwaltung)
//   POST /api/teams/:code/callup         Spieler:in hochrufen             (Verwaltung)
//
// "Verwaltung" = Rolle admin/sub_admin ODER als coach dieser Mannschaft
// eingetragen.
const teamRepository = require('../repositories/teamRepository');
const userRepository = require('../repositories/userRepository');
const { parseId, isRelationType } = require('../utils/validation');
const { ADMIN_ROLES, RELATION_TYPES } = require('../utils/roles');

const MANAGE_ROSTER_DENIED =
  'Nur Trainer:innen dieser Mannschaft dürfen den Kader ändern.';
const CALLUP_DENIED =
  'Nur Trainer:innen dieser Mannschaft dürfen Spieler hochrufen.';

/**
 * Lädt die Mannschaft per Code und prüft, ob der:die Anfragende sie verwalten
 * darf. Gibt entweder `{ ok:true, team }` oder eine fertige Fehler-Antwort.
 */
async function loadManageableTeam(req, code, deniedMessage) {
  const team = await teamRepository.findByCode(code);
  if (!team) {
    return { ok: false, status: 404, message: 'Mannschaft nicht gefunden.' };
  }
  const canManage =
    ADMIN_ROLES.includes(req.userRole) ||
    (await teamRepository.isCoachOf(req.userId, team.id));
  if (!canManage) {
    return { ok: false, status: 403, message: deniedMessage };
  }
  return { ok: true, team };
}

// GET /api/teams  (öffentlich)
async function listTeams(req, res, next) {
  try {
    const teams = await teamRepository.listAll();
    return res.json({ teams });
  } catch (err) {
    return next(err);
  }
}

// GET /api/teams/:code
async function getTeam(req, res, next) {
  try {
    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }

    const canManage =
      ADMIN_ROLES.includes(req.userRole) ||
      (await teamRepository.isCoachOf(req.userId, team.id));

    // E-Mail-Adressen nur für Verwaltende (Datensparsamkeit).
    const members = await teamRepository.getRoster(team.id, {
      includeEmail: canManage,
    });

    return res.json({
      team,
      members,
      counts: {
        player: members.player.length,
        coach: members.coach.length,
        fan: members.fan.length,
      },
      canManage,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/teams/:code/candidates?relationType=player
async function listCandidates(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    const candidates = await teamRepository.listRosterCandidates(
      loaded.team.id,
      relationType
    );
    return res.json({ candidates });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/members   Body: { userId, relationType? }
async function addMember(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const { userId, relationType = 'player' } = req.body || {};
    const targetId = parseId(userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }
    if (!isRelationType(relationType)) {
      return res.status(400).json({
        message: `Ungültiger Beziehungstyp. Erlaubt: ${RELATION_TYPES.join(', ')}.`,
      });
    }

    const target = await userRepository.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }
    if (!target.is_approved) {
      return res.status(400).json({
        message: 'Nur freigegebene Mitglieder können zugeordnet werden.',
      });
    }

    await teamRepository.addRelation(targetId, loaded.team.id, relationType);
    return res.status(201).json({ message: 'Zuordnung gespeichert.' });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/teams/:code/members/:userId?relationType=player
async function removeMember(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const targetId = parseId(req.params.userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    // Trainer:innen dürfen sich nicht selbst die Trainerrolle entziehen –
    // sonst verlieren sie den Zugriff auf die Seite.
    if (
      relationType === 'coach' &&
      targetId === req.userId &&
      !ADMIN_ROLES.includes(req.userRole)
    ) {
      return res.status(400).json({
        message:
          'Du kannst dich nicht selbst als Trainer:in dieser Mannschaft entfernen.',
      });
    }

    const result = await teamRepository.removeRelation(
      targetId,
      loaded.team.id,
      relationType
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Zuordnung nicht gefunden.' });
    }
    return res.json({ message: 'Zuordnung entfernt.' });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/callup   Body: { userId, targetTeamCode }
async function callUpPlayer(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      CALLUP_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }
    const sourceTeam = loaded.team;

    const { userId, targetTeamCode } = req.body || {};
    const targetId = parseId(userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const targetTeam = await teamRepository.findByCode(targetTeamCode);
    if (!targetTeam) {
      return res.status(404).json({ message: 'Zielmannschaft nicht gefunden.' });
    }
    if (targetTeam.id === sourceTeam.id) {
      return res
        .status(400)
        .json({ message: 'Quell- und Zielmannschaft sind identisch.' });
    }

    // Nur wer in dieser Mannschaft spielt, kann von hier hochgerufen werden.
    const plays = await teamRepository.hasRelation(
      targetId,
      sourceTeam.id,
      'player'
    );
    if (!plays) {
      return res
        .status(400)
        .json({ message: 'Die Person spielt nicht in dieser Mannschaft.' });
    }

    await teamRepository.addRelation(targetId, targetTeam.id, 'player');
    return res
      .status(201)
      .json({ message: `Hochgerufen zu ${targetTeam.name}.` });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listTeams,
  getTeam,
  listCandidates,
  addMember,
  removeMember,
  callUpPlayer,
};
