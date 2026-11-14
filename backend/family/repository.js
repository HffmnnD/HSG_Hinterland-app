// SQL der Eltern-Kind-Verknüpfung (Migration 020).
const crypto = require('crypto');

const pool = require('../config/db');
const { publicUrlFor } = require('../config/uploads');

const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');

const PERSON_COLUMNS =
  'u.id, u.first_name, u.last_name, u.photo_path, u.is_managed, u.is_approved, u.role';

function toPerson(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: publicUrlFor(row.photo_path),
    isManaged: Boolean(row.is_managed),
    isApproved: Boolean(row.is_approved),
    role: row.role,
  };
}

async function teamsFor(ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT ut.user_id, t.id, t.code, t.name, ut.relation_type
       FROM user_teams ut JOIN teams t ON t.id = ut.team_id
      WHERE ut.user_id IN (?) AND ut.is_confirmed = 1 AND ut.relation_type IN ('player', 'coach')
      ORDER BY t.sort_order, t.name`,
    [ids]
  );
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push({ id: row.id, code: row.code, name: row.name, relationType: row.relation_type });
  }
  return map;
}

/** Kinder einer Person (mit ihren Mannschaften). */
async function listChildren(parentId) {
  const [rows] = await pool.query(
    `SELECT ${PERSON_COLUMNS}, i.expires_at AS invite_expires_at
       FROM family_links f
       JOIN users u ON u.id = f.child_id
       LEFT JOIN family_child_invites i ON i.child_id = u.id AND i.expires_at > NOW()
      WHERE f.parent_id = ? ORDER BY u.first_name, u.last_name`,
    [parentId]
  );
  const teams = await teamsFor(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...toPerson(row),
    teams: teams.get(row.id) ?? [],
    // Offener Einladungscode, mit dem das Kind sein Profil übernehmen kann.
    inviteExpiresAt: row.is_managed && row.invite_expires_at ? row.invite_expires_at : null,
  }));
}

/** Eltern einer Person. */
async function listParents(childId) {
  const [rows] = await pool.query(
    `SELECT ${PERSON_COLUMNS} FROM family_links f JOIN users u ON u.id = f.parent_id
      WHERE f.child_id = ? ORDER BY u.first_name, u.last_name`,
    [childId]
  );
  return rows.map(toPerson);
}

/** Eltern vieler Kinder: Map childId -> parentId[] (für Push). */
async function parentsOf(childIds) {
  const map = new Map();
  if (childIds.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT f.child_id, f.parent_id, c.first_name AS child_name
       FROM family_links f JOIN users c ON c.id = f.child_id
      WHERE f.child_id IN (?)`,
    [childIds]
  );
  for (const row of rows) {
    if (!map.has(row.child_id)) map.set(row.child_id, { name: row.child_name, parents: [] });
    map.get(row.child_id).parents.push(row.parent_id);
  }
  return map;
}

async function isLinked(parentId, childId) {
  const [[row]] = await pool.query(
    'SELECT 1 AS ok FROM family_links WHERE parent_id = ? AND child_id = ?',
    [parentId, childId]
  );
  return Boolean(row);
}

async function link(parentId, childId, createdBy) {
  await pool.query(
    'INSERT IGNORE INTO family_links (parent_id, child_id, created_by) VALUES (?, ?, ?)',
    [parentId, childId, createdBy]
  );
}

async function unlink(parentId, childId) {
  const [result] = await pool.query(
    'DELETE FROM family_links WHERE parent_id = ? AND child_id = ?',
    [parentId, childId]
  );
  return result.affectedRows > 0;
}

async function countParents(childId) {
  const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM family_links WHERE child_id = ?', [childId]);
  return row.n;
}

/** Neuer Code für ein Kind – ersetzt einen älteren. */
async function saveCode(childId, code, hours) {
  await pool.query(
    `INSERT INTO family_link_codes (child_id, code_hash, expires_at)
     VALUES (?, ?, NOW() + INTERVAL ? HOUR)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP`,
    [childId, hash(code), hours]
  );
}

/** Code einlösen: liefert die Kind-ID und verbraucht den Code (einmalig). */
async function consumeCode(code) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      'SELECT child_id FROM family_link_codes WHERE code_hash = ? AND expires_at > NOW() FOR UPDATE',
      [hash(code)]
    );
    if (row) await conn.query('DELETE FROM family_link_codes WHERE child_id = ?', [row.child_id]);
    await conn.commit();
    return row ? row.child_id : null;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Kinderprofil ohne eigenen Login anlegen. */
async function createManagedChild({ firstName, lastName }, passwordHash) {
  // Platzhalter-Adresse in der reservierten Domain .invalid (RFC 2606): kann
  // nie zugestellt werden, hält aber die Eindeutigkeit von users.email.
  const email = `kind.${crypto.randomBytes(8).toString('hex')}@familie.invalid`;
  const [result] = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, is_managed, role, onboarding_completed_at)
     VALUES (?, ?, ?, ?, 1, 'spieler', NOW())`,
    [firstName, lastName, email, passwordHash]
  );
  return result.insertId;
}

// --- Einladung: Kind übernimmt sein Profil (Migration 023) -----------------

/** Neuer Einladungscode für ein Kinderprofil – ersetzt einen älteren. */
async function saveInvite(childId, code, days, createdBy) {
  await pool.query(
    `INSERT INTO family_child_invites (child_id, code_hash, created_by, expires_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ? DAY)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), created_by = VALUES(created_by),
                             expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP`,
    [childId, hash(code), createdBy, days]
  );
}

async function deleteInvite(childId) {
  const [result] = await pool.query('DELETE FROM family_child_invites WHERE child_id = ?', [childId]);
  return result.affectedRows > 0;
}

/** Gültigen Einladungscode nachsehen, ohne ihn zu verbrauchen. */
async function peekInvite(code) {
  const [[row]] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name
       FROM family_child_invites i JOIN users u ON u.id = i.child_id
      WHERE i.code_hash = ? AND i.expires_at > NOW() AND u.is_managed = 1`,
    [hash(code)]
  );
  return row ? { childId: row.id, firstName: row.first_name, lastName: row.last_name } : null;
}

/**
 * Einladung einlösen: Das Kinderprofil wird zu einem normalen Konto mit
 * E-Mail und Passwort. Alles andere (Mannschaften, Zusagen, Eltern) bleibt.
 * Wirft ER_DUP_ENTRY, wenn die E-Mail schon vergeben ist.
 * @returns {Promise<number|null>} die Kind-ID oder null bei ungültigem Code
 */
async function claimInvite(code, { email, passwordHash, firstName, lastName }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      `SELECT i.child_id FROM family_child_invites i JOIN users u ON u.id = i.child_id
        WHERE i.code_hash = ? AND i.expires_at > NOW() AND u.is_managed = 1
          FOR UPDATE`,
      [hash(code)]
    );
    if (!row) {
      await conn.rollback();
      return null;
    }
    await conn.query(
      `UPDATE users
          SET email = ?, password_hash = ?, first_name = ?, last_name = ?,
              is_managed = 0, sessions_valid_from = ?
        WHERE id = ?`,
      [email, passwordHash, firstName, lastName, Math.floor(Date.now() / 1000) - 1, row.child_id]
    );
    await conn.query('DELETE FROM family_child_invites WHERE child_id = ?', [row.child_id]);
    await conn.commit();
    return row.child_id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findPerson(id) {
  const [[row]] = await pool.query(`SELECT ${PERSON_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
  return row ? toPerson(row) : null;
}

module.exports = {
  listChildren,
  listParents,
  parentsOf,
  isLinked,
  link,
  unlink,
  countParents,
  saveCode,
  consumeCode,
  createManagedChild,
  findPerson,
  saveInvite,
  deleteInvite,
  peekInvite,
  claimInvite,
};
