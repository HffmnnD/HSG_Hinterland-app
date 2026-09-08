// Datenzugriff für Mannschaften (`teams`) und die Zuordnung Mitglied<->Team
// (`user_teams`). Enthält AUSSCHLIESSLICH SQL – keine Validierung, keine
// HTTP-Logik. Rückgaben sind bereits camelCase für das Frontend aufbereitet.
const pool = require('../config/db');

const RELATION_GROUPS = ['player', 'coach', 'fan'];

// --- teams -----------------------------------------------------------------

/** Alle Mannschaften, aufsteigend nach id. */
async function listAll(runner = pool) {
  const [rows] = await runner.query(
    'SELECT id, code, name FROM teams ORDER BY id'
  );
  return rows;
}

/** Eine Mannschaft anhand ihres Codes (case-insensitiv). null wenn unbekannt. */
async function findByCode(code, runner = pool) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const [rows] = await runner.query(
    'SELECT id, code, name FROM teams WHERE code = ?',
    [code.trim().toUpperCase()]
  );
  return rows[0] ?? null;
}

/** Von einer Liste von IDs die tatsächlich existierenden zurückgeben. */
async function findExistingIds(ids, runner = pool) {
  if (ids.length === 0) return [];
  const [rows] = await runner.query('SELECT id FROM teams WHERE id IN (?)', [ids]);
  return rows.map((row) => row.id);
}

// --- Zuordnungen eines Nutzers ------------------------------------------------

/**
 * Mannschaften eines Nutzers inkl. Beziehungstyp.
 * @returns {Promise<{id:number, code:string, name:string, relationType:string}[]>}
 */
async function getTeamsForUser(userId, runner = pool) {
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

/** Ist der Nutzer als Trainer:in (`coach`) dieser Mannschaft eingetragen? */
async function isCoachOf(userId, teamId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = 'coach'
      LIMIT 1`,
    [userId, teamId]
  );
  return rows.length > 0;
}

/** Hat der Nutzer diese konkrete Beziehung zur Mannschaft? */
async function hasRelation(userId, teamId, relationType, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?
      LIMIT 1`,
    [userId, teamId, relationType]
  );
  return rows.length > 0;
}

// --- Kader einer Mannschaft ------------------------------------------------

/**
 * Kader einer Mannschaft, gruppiert nach `player` / `coach` / `fan`.
 * @param {{ includeEmail?: boolean }} [opts] E-Mail nur für Verwaltende ausgeben.
 * @returns {Promise<{ player: object[], coach: object[], fan: object[] }>}
 */
async function getRoster(teamId, { includeEmail = false } = {}, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_approved,
            ut.relation_type
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ?
      ORDER BY u.last_name, u.first_name`,
    [teamId]
  );

  const roster = { player: [], coach: [], fan: [] };
  for (const row of rows) {
    if (!roster[row.relation_type]) continue;
    roster[row.relation_type].push({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isApproved: Boolean(row.is_approved),
      ...(includeEmail ? { email: row.email } : {}),
    });
  }
  return roster;
}

/**
 * Freigegebene Mitglieder, die diese Beziehung zur Mannschaft NOCH NICHT haben
 * (Auswahlliste zum Hinzufügen).
 */
async function listRosterCandidates(teamId, relationType, runner = pool) {
  const [rows] = await runner.query(
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
    [teamId, relationType]
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
  }));
}

// --- Zuordnungen schreiben ------------------------------------------------

/** Einzelne Beziehung anlegen (doppelte werden ignoriert). */
async function addRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    `INSERT INTO user_teams (user_id, team_id, relation_type)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE relation_type = relation_type`,
    [userId, teamId, relationType]
  );
  return result;
}

/** Einzelne Beziehung entfernen. */
async function removeRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    `DELETE FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?`,
    [userId, teamId, relationType]
  );
  return result;
}

/**
 * Mehrere Beziehungen auf einmal einfügen (z. B. bei der Registrierung).
 * Muss innerhalb einer Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ teamId:number, relationType:string }[]} relations
 */
async function insertRelations(conn, userId, relations) {
  if (relations.length === 0) return;
  await conn.query(
    'INSERT INTO user_teams (user_id, team_id, relation_type) VALUES ?',
    [relations.map((rel) => [userId, rel.teamId, rel.relationType])]
  );
}

/**
 * Ersetzt für EINEN Beziehungstyp alle Mannschaften eines Nutzers
 * (andere Beziehungstypen bleiben unberührt). Muss in einer Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function replaceRelationTeams(conn, userId, teamIds, relationType) {
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

module.exports = {
  RELATION_GROUPS,
  listAll,
  findByCode,
  findExistingIds,
  getTeamsForUser,
  isCoachOf,
  hasRelation,
  getRoster,
  listRosterCandidates,
  addRelation,
  removeRelation,
  insertRelations,
  replaceRelationTeams,
};
