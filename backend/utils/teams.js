// Hilfsfunktionen für die Mannschaftszuordnung (user_teams).
const pool = require('../config/db');
const { RELATION_TYPES } = require('./roles');

/**
 * Prüft und normalisiert eine Liste von Team-IDs aus einem Request.
 *
 * @returns {Promise<{ ok: true, ids: number[] | undefined } | { ok: false, message: string }>}
 *   `ids === undefined` bedeutet: Feld war nicht im Request enthalten.
 */
async function normalizeTeamIds(teamIds) {
  if (teamIds === undefined) return { ok: true, ids: undefined };

  if (!Array.isArray(teamIds)) {
    return { ok: false, message: 'teamIds muss eine Liste sein.' };
  }

  const ids = [...new Set(teamIds.map((value) => Number(value)))];

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, message: 'Ungültige Mannschafts-ID.' };
  }
  if (ids.length === 0) return { ok: true, ids: [] };

  const [rows] = await pool.query('SELECT id FROM teams WHERE id IN (?)', [ids]);
  if (rows.length !== ids.length) {
    return { ok: false, message: 'Mindestens eine Mannschaft existiert nicht.' };
  }

  return { ok: true, ids };
}

function isValidRelationType(relationType) {
  return RELATION_TYPES.includes(relationType);
}

/**
 * Prüft und normalisiert eine Liste von Mannschafts-Beziehungen
 * (`[{ teamId, relationType }]`) aus einem Request.
 *
 * @returns {Promise<{ ok: true, relations: {teamId:number, relationType:string}[] | undefined }
 *                  | { ok: false, message: string }>}
 */
async function normalizeTeamRelations(teams) {
  if (teams === undefined) return { ok: true, relations: undefined };

  if (!Array.isArray(teams)) {
    return { ok: false, message: 'teams muss eine Liste sein.' };
  }

  const relations = [];
  const seen = new Set();

  for (const entry of teams) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, message: 'Ungültiger Mannschaftseintrag.' };
    }

    const teamId = Number(entry.teamId);
    const relationType = entry.relationType ?? 'player';

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return { ok: false, message: 'Ungültige Mannschafts-ID.' };
    }
    if (!isValidRelationType(relationType)) {
      return {
        ok: false,
        message: `Ungültiger Beziehungstyp. Erlaubt: ${RELATION_TYPES.join(', ')}.`,
      };
    }

    const key = `${teamId}:${relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({ teamId, relationType });
  }

  if (relations.length === 0) return { ok: true, relations: [] };

  const ids = [...new Set(relations.map((r) => r.teamId))];
  const [rows] = await pool.query('SELECT id FROM teams WHERE id IN (?)', [ids]);
  if (rows.length !== ids.length) {
    return { ok: false, message: 'Mindestens eine Mannschaft existiert nicht.' };
  }

  return { ok: true, relations };
}

/**
 * Schreibt mehrere Beziehungen auf einmal (innerhalb einer Transaktion).
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function insertUserTeamRelations(conn, userId, relations) {
  if (relations.length === 0) return;
  await conn.query(
    'INSERT INTO user_teams (user_id, team_id, relation_type) VALUES ?',
    [relations.map((r) => [userId, r.teamId, r.relationType])]
  );
}

/**
 * Lädt die Mannschaften eines Nutzers inkl. Beziehungstyp.
 * @param {number} userId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [runner]
 * @returns {Promise<{id:number, code:string, name:string, relationType:string}[]>}
 */
async function loadTeamsForUser(userId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT t.id, t.code, t.name, ut.relation_type
       FROM user_teams ut
       JOIN teams t ON t.id = ut.team_id
      WHERE ut.user_id = ?
      ORDER BY t.id, ut.relation_type`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    relationType: row.relation_type,
  }));
}

/**
 * Ersetzt die Zuordnungen eines Nutzers für EINEN Beziehungstyp.
 * Andere Beziehungstypen bleiben unangetastet.
 * (Innerhalb einer bestehenden Transaktion auszuführen.)
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} userId
 * @param {number[]} teamIds
 * @param {'player'|'coach'|'fan'} relationType
 */
async function replaceUserTeams(conn, userId, teamIds, relationType = 'player') {
  await conn.query(
    'DELETE FROM user_teams WHERE user_id = ? AND relation_type = ?',
    [userId, relationType]
  );
  if (teamIds.length > 0) {
    await conn.query(
      'INSERT INTO user_teams (user_id, team_id, relation_type) VALUES ?',
      [teamIds.map((teamId) => [userId, teamId, relationType])]
    );
  }
}

/**
 * Fügt eine einzelne Beziehung hinzu (doppelte werden ignoriert).
 */
async function addUserTeamRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    `INSERT INTO user_teams (user_id, team_id, relation_type)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE relation_type = relation_type`,
    [userId, teamId, relationType]
  );
  return result;
}

/**
 * Entfernt eine einzelne Beziehung.
 */
async function removeUserTeamRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    'DELETE FROM user_teams WHERE user_id = ? AND team_id = ? AND relation_type = ?',
    [userId, teamId, relationType]
  );
  return result;
}

/**
 * Ist der Nutzer als Trainer der Mannschaft eingetragen?
 */
async function isCoachOfTeam(userId, teamId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = 'coach'
      LIMIT 1`,
    [userId, teamId]
  );
  return rows.length > 0;
}

module.exports = {
  normalizeTeamIds,
  normalizeTeamRelations,
  isValidRelationType,
  loadTeamsForUser,
  replaceUserTeams,
  insertUserTeamRelations,
  addUserTeamRelation,
  removeUserTeamRelation,
  isCoachOfTeam,
};
