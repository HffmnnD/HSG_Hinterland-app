// Wirksame Rechte einer Person – berechnet, kurz zwischengespeichert.
//
//   Grundrolle (users.role) + Zusatzrollen (user_roles)
//   + Einzelfreigaben (user_permissions grant) − Einzelentzüge (deny)
//   Superuser-Rolle  ->  immer alle Rechte
//
// Jede Anfrage braucht diese Angaben (authenticate). Ein Cache von wenigen
// Sekunden spart pro Anfrage drei Abfragen; jede Änderung an Rollen, Rechten,
// Sperre oder Familie ruft invalidate() auf und greift damit sofort.
const pool = require('../config/db');
const { PERMISSION_KEYS, isPermission } = require('./permissions');

const CACHE_MS = 10 * 1000;
const MAX_ENTRIES = 5000;
const cache = new Map();

let schemaReady = null;
let checkedAt = 0;

/** Gibt es die Tabellen aus Migration 019 schon? (einmal je Prozess geprüft) */
async function hasAccessTables() {
  // Ein Ja gilt für immer, ein Nein nur kurz: läuft die Migration bei laufendem
  // Server, greift sie nach spätestens einer halben Minute.
  if (schemaReady === true || (schemaReady === false && Date.now() - checkedAt < 30000)) return schemaReady;
  checkedAt = Date.now();
  try {
    await pool.query('SELECT 1 FROM roles LIMIT 1');
    schemaReady = true;
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    console.error('Rechte: Migration 019 fehlt. Bitte im Ordner backend `npm run migrate` ausführen.');
    schemaReady = false;
  }
  return schemaReady;
}

// Rückfall ohne Migration 019: die alten, fest verdrahteten Rollen.
const LEGACY = {
  admin: PERMISSION_KEYS,
  sub_admin: PERMISSION_KEYS.filter((key) => !['access.manage', 'backups.manage'].includes(key)),
  trainer: ['members.view'],
};

let familyReady = null;
let familyCheckedAt = 0;
async function loadChildIds(userId) {
  if (familyReady === false && Date.now() - familyCheckedAt < 30000) return [];
  familyCheckedAt = Date.now();
  try {
    const [rows] = await pool.query('SELECT child_id FROM family_links WHERE parent_id = ?', [userId]);
    familyReady = true;
    return rows.map((row) => row.child_id);
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
    familyReady = false;
    return [];
  }
}

async function compute(userId) {
  const [[user]] = await pool.query(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return null;

  const base = {
    userId: user.id,
    role: user.role,
    isApproved: Boolean(user.is_approved),
    sessionsValidFrom: Number(user.sessions_valid_from) || 0,
    name: `${user.first_name} ${user.last_name}`.trim(),
    childIds: await loadChildIds(user.id),
  };

  if (!(await hasAccessTables())) {
    const permissions = new Set(LEGACY[user.role] ?? []);
    return { ...base, roles: [user.role], isSuperuser: user.role === 'admin', permissions };
  }

  const [roleRows] = await pool.query(
    `SELECT r.id, r.role_key, r.is_superuser
       FROM roles r
      WHERE r.role_key = ?
         OR r.id IN (SELECT role_id FROM user_roles WHERE user_id = ?)`,
    [user.role, user.id]
  );
  const roleIds = roleRows.map((row) => row.id);
  const isSuperuser = roleRows.some((row) => row.is_superuser);

  const permissions = new Set();
  if (isSuperuser) {
    PERMISSION_KEYS.forEach((key) => permissions.add(key));
  } else {
    if (roleIds.length > 0) {
      const [rows] = await pool.query(
        'SELECT DISTINCT permission FROM role_permissions WHERE role_id IN (?)',
        [roleIds]
      );
      rows.forEach((row) => isPermission(row.permission) && permissions.add(row.permission));
    }
    const [overrides] = await pool.query(
      'SELECT permission, effect FROM user_permissions WHERE user_id = ?',
      [user.id]
    );
    for (const row of overrides) {
      if (!isPermission(row.permission)) continue;
      if (row.effect === 'grant') permissions.add(row.permission);
    }
    for (const row of overrides) {
      if (row.effect === 'deny') permissions.delete(row.permission);
    }
  }

  return {
    ...base,
    roles: roleRows.map((row) => row.role_key),
    isSuperuser,
    permissions,
  };
}

/**
 * Zugriffsdaten einer Person (null = Konto existiert nicht).
 * @returns {Promise<null | { userId:number, role:string, roles:string[],
 *   isApproved:boolean, sessionsValidFrom:number, isSuperuser:boolean,
 *   permissions:Set<string>, childIds:number[], name:string }>}
 */
async function getAccess(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = await compute(userId);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(userId, { value, at: Date.now() });
  return value;
}

/** Cache verwerfen – für eine Person oder (ohne Argument) für alle. */
function invalidate(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(Number(userId));
}

/** Darf die Anfrage das? `req.access` setzt authenticate. */
function can(req, permission) {
  return Boolean(req.access?.permissions?.has(permission));
}

/** Für Viewer-Objekte (teamAccess u. a.). */
function viewerOf(req) {
  return {
    userId: req.userId,
    userRole: req.userRole,
    permissions: req.access?.permissions ?? new Set(),
  };
}

/** Viewer für eine Person ohne Anfrage (z. B. Kalender-Abo). */
async function viewerFor(userId) {
  const access = await getAccess(userId);
  return {
    userId,
    userRole: access?.role,
    permissions: access?.permissions ?? new Set(),
  };
}

module.exports = { getAccess, invalidate, can, viewerOf, viewerFor, hasAccessTables };
