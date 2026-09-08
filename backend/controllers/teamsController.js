// Teams-Controller:
//  - öffentliche Mannschaftsliste (für das Registrierungsformular)
//  - Mannschaftsseite mit Kader
//  - Verwaltung durch Trainer:innen der Mannschaft sowie admin/sub_admin
const pool = require('../config/db');
const {
  isValidRelationType,
  addUserTeamRelation,
  removeUserTeamRelation,
  isCoachOfTeam,
} = require('../utils/teams');
const { ADMIN_ROLES, RELATION_TYPES } = require('../utils/roles');

// GET /api/teams (öffentlich)
async function listTeams(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, code, name FROM teams ORDER BY id'
    );
    return res.json({ teams: rows });
  } catch (err) {
    return next(err);
  }
}

async function findTeamByCode(code) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const [rows] = await pool.query(
    'SELECT id, code, name FROM teams WHERE code = ?',
    [code.trim().toUpperCase()]
  );
  return rows[0] ?? null;
}

/**
 * Darf der angemeldete Nutzer diese Mannschaft verwalten?
 * Berechtigt sind admin, sub_admin und als Trainer eingetragene Nutzer.
 */
async function mayManageTeam(req, teamId) {
  if (ADMIN_ROLES.includes(req.userRole)) return true;
  return isCoachOfTeam(req.userId, teamId);
}

// GET /api/teams/:code – Mannschaftsinfos + Kader
async function getTeam(req, res, next) {
  try {
    const team = await findTeamByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }

    const canManage = await mayManageTeam(req, team.id);

    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_approved,
              ut.relation_type
         FROM user_teams ut
         JOIN users u ON u.id = ut.user_id
        WHERE ut.team_id = ?
        ORDER BY u.last_name, u.first_name`,
      [team.id]
    );

    // E-Mail-Adressen nur für Verwaltende (Datensparsamkeit).
    const toMember = (row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isApproved: Boolean(row.is_approved),
      ...(canManage ? { email: row.email } : {}),
    });

    const members = { player: [], coach: [], fan: [] };
    for (const row of rows) {
      if (members[row.relation_type]) {
        members[row.relation_type].push(toMember(row));
      }
    }

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

// GET /api/teams/:code/candidates – Nutzer, die noch nicht Spieler sind
async function listCandidates(req, res, next) {
  try {
    const team = await findTeamByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!(await mayManageTeam(req, team.id))) {
      return res.status(403).json({
        message: 'Nur Trainer:innen dieser Mannschaft dürfen den Kader ändern.',
      });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isValidRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    // Nur freigegebene Konten, die diese Beziehung noch nicht haben.
    const [rows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role
         FROM users u
        WHERE u.is_approved = 1
          AND NOT EXISTS (
            SELECT 1 FROM user_teams ut
             WHERE ut.user_id = u.id
               AND ut.team_id = ?
               AND ut.relation_type = ?
          )
        ORDER BY u.last_name, u.first_name`,
      [team.id, relationType]
    );

    return res.json({
      candidates: rows.map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        role: row.role,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/members – Body: { userId, relationType? }
async function addMember(req, res, next) {
  try {
    const team = await findTeamByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!(await mayManageTeam(req, team.id))) {
      return res.status(403).json({
        message: 'Nur Trainer:innen dieser Mannschaft dürfen den Kader ändern.',
      });
    }

    const { userId, relationType = 'player' } = req.body || {};
    const targetId = Number(userId);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }
    if (!isValidRelationType(relationType)) {
      return res.status(400).json({
        message: `Ungültiger Beziehungstyp. Erlaubt: ${RELATION_TYPES.join(', ')}.`,
      });
    }

    const [[target]] = await pool.query(
      'SELECT id, is_approved FROM users WHERE id = ?',
      [targetId]
    );
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }
    if (!target.is_approved) {
      return res.status(400).json({
        message: 'Nur freigegebene Mitglieder können zugeordnet werden.',
      });
    }

    await addUserTeamRelation(targetId, team.id, relationType);
    return res.status(201).json({ message: 'Zuordnung gespeichert.' });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/teams/:code/members/:userId?relationType=player
async function removeMember(req, res, next) {
  try {
    const team = await findTeamByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!(await mayManageTeam(req, team.id))) {
      return res.status(403).json({
        message: 'Nur Trainer:innen dieser Mannschaft dürfen den Kader ändern.',
      });
    }

    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isValidRelationType(relationType)) {
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

    const result = await removeUserTeamRelation(targetId, team.id, relationType);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Zuordnung nicht gefunden.' });
    }

    return res.json({ message: 'Zuordnung entfernt.' });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/callup – Body: { userId, targetTeamCode }
// Ruft eine:n Spieler:in in eine andere Mannschaft hoch. Die bestehende
// Zuordnung bleibt erhalten.
async function callUpPlayer(req, res, next) {
  try {
    const sourceTeam = await findTeamByCode(req.params.code);
    if (!sourceTeam) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!(await mayManageTeam(req, sourceTeam.id))) {
      return res.status(403).json({
        message: 'Nur Trainer:innen dieser Mannschaft dürfen Spieler hochrufen.',
      });
    }

    const { userId, targetTeamCode } = req.body || {};
    const targetId = Number(userId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const targetTeam = await findTeamByCode(targetTeamCode);
    if (!targetTeam) {
      return res.status(404).json({ message: 'Zielmannschaft nicht gefunden.' });
    }
    if (targetTeam.id === sourceTeam.id) {
      return res.status(400).json({
        message: 'Quell- und Zielmannschaft sind identisch.',
      });
    }

    // Nur wer in dieser Mannschaft spielt, kann von hier hochgerufen werden.
    const [[membership]] = await pool.query(
      `SELECT 1 AS ok FROM user_teams
        WHERE user_id = ? AND team_id = ? AND relation_type = 'player'
        LIMIT 1`,
      [targetId, sourceTeam.id]
    );
    if (!membership) {
      return res.status(400).json({
        message: 'Die Person spielt nicht in dieser Mannschaft.',
      });
    }

    await addUserTeamRelation(targetId, targetTeam.id, 'player');

    return res.status(201).json({
      message: `Hochgerufen zu ${targetTeam.name}.`,
    });
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
