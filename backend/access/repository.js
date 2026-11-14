// SQL rund um Rollen und Einzelrechte (Migration 019).
const pool = require('../config/db');

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

function toRole(row, permissions = []) {
  return {
    id: row.id,
    key: row.role_key,
    name: row.name,
    description: row.description,
    isSystem: Boolean(row.is_system),
    isSuperuser: Boolean(row.is_superuser),
    sortOrder: row.sort_order,
    memberCount: Number(row.member_count ?? 0),
    permissions,
  };
}

/** Alle Rollen mit Rechten und Anzahl der Personen (Grund- + Zusatzrolle). */
async function listRoles() {
  const [rows] = await pool.query(
    `SELECT r.*,
            (SELECT COUNT(*) FROM users u WHERE u.role = r.role_key)
          + (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS member_count
       FROM roles r
      ORDER BY r.sort_order, r.name`
  );
  const [perms] = await pool.query('SELECT role_id, permission FROM role_permissions');
  const byRole = new Map();
  for (const row of perms) {
    if (!byRole.has(row.role_id)) byRole.set(row.role_id, []);
    byRole.get(row.role_id).push(row.permission);
  }
  return rows.map((row) => toRole(row, byRole.get(row.id) ?? []));
}

async function findRole(id) {
  const [[row]] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
  if (!row) return null;
  const [perms] = await pool.query('SELECT permission FROM role_permissions WHERE role_id = ?', [id]);
  return toRole(row, perms.map((p) => p.permission));
}

async function findRolesByKeys(keys) {
  if (keys.length === 0) return [];
  const [rows] = await pool.query('SELECT * FROM roles WHERE role_key IN (?)', [keys]);
  const ids = rows.map((r) => r.id);
  const [perms] = ids.length
    ? await pool.query('SELECT role_id, permission FROM role_permissions WHERE role_id IN (?)', [ids])
    : [[]];
  return rows.map((row) =>
    toRole(row, perms.filter((p) => p.role_id === row.id).map((p) => p.permission))
  );
}

async function createRole({ key, name, description, permissions }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[{ next }]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM roles');
    const [result] = await conn.query(
      'INSERT INTO roles (role_key, name, description, sort_order) VALUES (?, ?, ?, ?)',
      [key, name, description, next]
    );
    if (permissions.length > 0) {
      await conn.query('INSERT INTO role_permissions (role_id, permission) VALUES ?', [
        permissions.map((perm) => [result.insertId, perm]),
      ]);
    }
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateRole(id, { name, description, permissions }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (name !== undefined || description !== undefined) {
      await conn.query(
        'UPDATE roles SET name = COALESCE(?, name), description = ? WHERE id = ?',
        [name ?? null, description ?? null, id]
      );
    }
    if (permissions !== undefined) {
      await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      if (permissions.length > 0) {
        await conn.query('INSERT INTO role_permissions (role_id, permission) VALUES ?', [
          permissions.map((perm) => [id, perm]),
        ]);
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteRole(id) {
  const [result] = await pool.query('DELETE FROM roles WHERE id = ? AND is_system = 0', [id]);
  return result.affectedRows > 0;
}

/** Zusatzrollen und Einzelrechte einer Person. */
async function getUserGrants(userId) {
  const [roles] = await pool.query(
    `SELECT r.role_key FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?`,
    [userId]
  );
  const [overrides] = await pool.query(
    'SELECT permission, effect FROM user_permissions WHERE user_id = ? ORDER BY permission',
    [userId]
  );
  return {
    extraRoles: roles.map((r) => r.role_key),
    overrides: overrides.map((o) => ({ permission: o.permission, effect: o.effect })),
  };
}

/** Zusatzrollen für viele Personen auf einmal (Mitgliederliste). */
async function getExtraRolesFor(userIds) {
  const map = new Map();
  if (userIds.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT ur.user_id, r.role_key FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id IN (?) ORDER BY r.sort_order`,
    [userIds]
  );
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(row.role_key);
  }
  return map;
}

async function setUserExtraRoles(userId, roleIds, assignedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    if (roleIds.length > 0) {
      await conn.query('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ?', [
        roleIds.map((roleId) => [userId, roleId, assignedBy]),
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setUserOverrides(userId, overrides, assignedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    if (overrides.length > 0) {
      await conn.query(
        'INSERT INTO user_permissions (user_id, permission, effect, assigned_by) VALUES ?',
        [overrides.map((o) => [userId, o.permission, o.effect, assignedBy])]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Aktive Personen mit Superuser-Rolle (als Grund- oder Zusatzrolle).
 * @param {number} [excludeUserId]  diese Person nicht mitzählen
 */
async function countActiveSuperusers(excludeUserId = 0) {
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.is_approved = 1 AND u.id <> ?
        AND (u.role IN (SELECT role_key FROM roles WHERE is_superuser = 1) OR r.is_superuser = 1)`,
    [excludeUserId]
  );
  return row.count;
}

module.exports = {
  KEY_PATTERN,
  listRoles,
  findRole,
  findRolesByKeys,
  createRole,
  updateRole,
  deleteRole,
  getUserGrants,
  getExtraRolesFor,
  setUserExtraRoles,
  setUserOverrides,
  countActiveSuperusers,
};
