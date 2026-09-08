// Datenzugriff für Mannschaften (`teams`) und die Zuordnung Mitglied<->Team
// (`user_teams`). Enthält AUSSCHLIESSLICH SQL – keine Validierung, keine
// HTTP-Logik. Rückgaben sind bereits camelCase für das Frontend aufbereitet.
//
// `is_confirmed` steuert den Beitrittsprozess:
//   0 = offene Beitrittsanfrage (nur der Trainer sieht sie)
//   1 = bestätigt (taucht im öffentlichen Kader auf)
const pool = require('../config/db');

const RELATION_GROUPS = ['player', 'coach', 'fan'];

// Beziehungstypen, die bei der Registrierung sofort als bestätigt gelten.
const AUTO_CONFIRMED_RELATIONS = new Set(['fan']);

/** is_confirmed-Wert für eine bei der Registrierung angelegte Beziehung. */
function initialConfirmation(relationType) {
  return AUTO_CONFIRMED_RELATIONS.has(relationType) ? 1 : 0;
}

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
 * Mannschaften eines Nutzers inkl. Beziehungstyp und Bestätigungsstatus.
 * @returns {Promise<{id:number, code:string, name:string,
 *                    relationType:string, isConfirmed:boolean}[]>}
 */
async function getTeamsForUser(userId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT t.id, t.code, t.name, ut.relation_type, ut.is_confirmed
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
    isConfirmed: Boolean(row.is_confirmed),
  }));
}

/** Ist der Nutzer als BESTÄTIGTE:r Trainer:in (`coach`) dieser Mannschaft? */
async function isCoachOf(userId, teamId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = 'coach'
        AND is_confirmed = 1
      LIMIT 1`,
    [userId, teamId]
  );
  return rows.length > 0;
}

/** Hat der Nutzer diese konkrete (bestätigte) Beziehung zur Mannschaft? */
async function hasConfirmedRelation(userId, teamId, relationType, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?
        AND is_confirmed = 1
      LIMIT 1`,
    [userId, teamId, relationType]
  );
  return rows.length > 0;
}

// --- Kader einer Mannschaft ------------------------------------------------

function mapMember(row, includeEmail) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isApproved: Boolean(row.is_approved),
    ...(includeEmail ? { email: row.email } : {}),
  };
}

/**
 * BESTÄTIGTER Kader einer Mannschaft, gruppiert nach player / coach / fan.
 * @param {{ includeEmail?: boolean }} [opts] E-Mail nur für Verwaltende ausgeben.
 */
async function getConfirmedRoster(teamId, { includeEmail = false } = {}, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_approved, ut.relation_type
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND ut.is_confirmed = 1
      ORDER BY u.last_name, u.first_name`,
    [teamId]
  );

  const roster = { player: [], coach: [], fan: [] };
  for (const row of rows) {
    if (roster[row.relation_type]) {
      roster[row.relation_type].push(mapMember(row, includeEmail));
    }
  }
  return roster;
}

/**
 * OFFENE Beitrittsanfragen einer Mannschaft (is_confirmed = 0) als flache
 * Liste – eine Zeile pro (Nutzer, Beziehungstyp).
 */
async function getPendingMembers(teamId, { includeEmail = false } = {}, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_approved, ut.relation_type
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND ut.is_confirmed = 0
      ORDER BY u.last_name, u.first_name`,
    [teamId]
  );
  return rows.map((row) => ({
    ...mapMember(row, includeEmail),
    relationType: row.relation_type,
  }));
}

/**
 * Freigegebene Mitglieder, die diese Beziehung zur Mannschaft NOCH NICHT haben
 * (auch keine offene Anfrage) – Auswahlliste zum manuellen Hinzufügen.
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

/**
 * Einzelne Beziehung anlegen. Doppelte werden ignoriert; ein bereits
 * vorhandener Eintrag wird auf Wunsch auf bestätigt gehoben.
 * Manuell durch Trainer/Admin -> `isConfirmed = 1` (Default).
 */
async function addRelation(userId, teamId, relationType, isConfirmed = 1, runner = pool) {
  const confirmed = isConfirmed ? 1 : 0;
  const [result] = await runner.query(
    `INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_confirmed = GREATEST(is_confirmed, VALUES(is_confirmed))`,
    [userId, teamId, relationType, confirmed]
  );
  return result;
}

/** Einzelne Beziehung entfernen (dient auch dem Ablehnen einer Anfrage). */
async function removeRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    `DELETE FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?`,
    [userId, teamId, relationType]
  );
  return result;
}

/**
 * Bestätigt offene Anfragen eines Nutzers für eine Mannschaft.
 * Ohne `relationType` werden alle offenen Beziehungen bestätigt.
 * @returns {Promise<number>} Anzahl bestätigter Zeilen
 */
async function confirmRelations(userId, teamId, relationType, runner = pool) {
  const params = [userId, teamId];
  let sql =
    'UPDATE user_teams SET is_confirmed = 1 WHERE user_id = ? AND team_id = ? AND is_confirmed = 0';
  if (relationType !== undefined) {
    sql += ' AND relation_type = ?';
    params.push(relationType);
  }
  const [result] = await runner.query(sql, params);
  return result.affectedRows;
}

/**
 * Mehrere Beziehungen auf einmal einfügen (bei der Registrierung).
 * player/coach -> is_confirmed 0 (Anfrage), fan -> 1. Muss in einer
 * Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ teamId:number, relationType:string }[]} relations
 */
async function insertRelations(conn, userId, relations) {
  if (relations.length === 0) return;
  await conn.query(
    'INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed) VALUES ?',
    [
      relations.map((rel) => [
        userId,
        rel.teamId,
        rel.relationType,
        initialConfirmation(rel.relationType),
      ]),
    ]
  );
}

/**
 * Ersetzt für EINEN Beziehungstyp alle Mannschaften eines Nutzers
 * (andere Beziehungstypen bleiben unberührt). Von Admin/Trainer ausgelöst ->
 * die neuen Einträge gelten als bestätigt. Muss in einer Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function replaceRelationTeams(conn, userId, teamIds, relationType) {
  await conn.query(
    'DELETE FROM user_teams WHERE user_id = ? AND relation_type = ?',
    [userId, relationType]
  );
  if (teamIds.length > 0) {
    await conn.query(
      'INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed) VALUES ?',
      [teamIds.map((teamId) => [userId, teamId, relationType, 1])]
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
  hasConfirmedRelation,
  getConfirmedRoster,
  getPendingMembers,
  listRosterCandidates,
  addRelation,
  removeRelation,
  confirmRelations,
  insertRelations,
  replaceRelationTeams,
};
