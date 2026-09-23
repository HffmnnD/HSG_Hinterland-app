// Datenzugriff für Nutzerkonten (`users`) und deren zusammengesetztes Profil
// (Konto + Mannschaften + Helferdienste).
//
// Enthält AUSSCHLIESSLICH SQL / Transaktions-Orchestrierung – keine Validierung,
// keine HTTP-Logik. Alle "Profil"-Rückgaben haben exakt DIESE Struktur, damit
// das Frontend sich auf ein Format verlassen kann:
//
//   {
//     id, firstName, lastName, email,
//     isApproved: boolean,
//     role: 'admin' | 'sub_admin' | 'trainer' | 'spieler' | 'zuschauer',
//     teams:    [{ id, code, name, relationType }],
//     services: [ 'zeitnehmer' | 'verkaufsdienst' ],
//     createdAt
//   }
const pool = require('../config/db');
const teamRepository = require('./teamRepository');
const serviceRepository = require('./serviceRepository');

// Spalten, die an den Client dürfen – NIE password_hash.
const PUBLIC_COLUMNS =
  'id, first_name, last_name, email, is_approved, role, created_at';

/** Formt eine users-Zeile + Relationen in die oben dokumentierte Struktur. */
function toProfile(row, teams, services) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    isApproved: Boolean(row.is_approved),
    role: row.role,
    teams,
    services,
    createdAt: row.created_at,
  };
}

// --- Lesen ---------------------------------------------------------------

/** Konto per E-Mail. Enthält password_hash (nur für den Login-Check!). */
async function findByEmail(email, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = ?`,
    [email]
  );
  return rows[0] ?? null;
}

/** Konto per id (ohne password_hash). null wenn unbekannt. */
async function findById(id, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/** Anzahl der aktiven (nicht gesperrten) Admin-Konten. */
async function countActiveAdmins(runner = pool) {
  const [[row]] = await runner.query(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_approved = 1"
  );
  return row.count;
}

/**
 * Hebt die globale Rolle auf 'trainer' an, WENN sie aktuell nur 'spieler'
 * oder 'zuschauer' ist. `admin`/`sub_admin`/`trainer` bleiben unangetastet.
 * @returns {Promise<boolean>} true, wenn tatsächlich hochgestuft wurde
 */
async function promoteToTrainerIfBasic(userId, runner = pool) {
  const [result] = await runner.query(
    "UPDATE users SET role = 'trainer' WHERE id = ? AND role IN ('spieler', 'zuschauer')",
    [userId]
  );
  return result.affectedRows > 0;
}

/**
 * Vollständiges Profil (Konto + Mannschaften + Dienste) zu einer bereits
 * geladenen users-Zeile.
 */
async function buildProfile(userRow, runner = pool) {
  const [teams, services] = await Promise.all([
    teamRepository.getTeamsForUser(userRow.id, runner),
    serviceRepository.getForUser(userRow.id, runner),
  ]);
  return toProfile(userRow, teams, services);
}

/** Vollständiges Profil per id. null wenn das Konto nicht existiert. */
async function getFullProfile(id, runner = pool) {
  const userRow = await findById(id, runner);
  return userRow ? buildProfile(userRow, runner) : null;
}

/**
 * Alle Konten als Profile – für das Admin-Dashboard.
 * Nutzt 3 Sammelabfragen statt N+1.
 */
async function listAllWithProfiles(runner = pool) {
  const [users] = await runner.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at DESC`
  );

  const [memberships] = await runner.query(
    `SELECT ut.user_id, ut.relation_type, t.id, t.code, t.name
       FROM user_teams ut
       JOIN teams t ON t.id = ut.team_id
      ORDER BY t.id`
  );
  const [services] = await runner.query(
    'SELECT user_id, service_type FROM user_services ORDER BY service_type'
  );

  const teamsByUser = groupBy(memberships, 'user_id', (m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    relationType: m.relation_type,
  }));
  const servicesByUser = groupBy(services, 'user_id', (s) => s.service_type);

  return users.map((row) =>
    toProfile(row, teamsByUser.get(row.id) ?? [], servicesByUser.get(row.id) ?? [])
  );
}

/**
 * Seite der Mitgliederliste für die Verwaltung – gefiltert, durchsucht und
 * seitenweise.
 *
 * Warum nicht wie bisher alles laden und im Browser filtern: bei 1000+
 * Konten wären das je Aufruf rund ein Megabyte JSON plus 1000 Zeilen im DOM.
 * Gefiltert und begrenzt wird deshalb in SQL; der Browser bekommt nur die
 * Seite, die er wirklich anzeigt.
 *
 * Die Relationen (Mannschaften, Dienste) werden ausschliesslich für die IDs
 * DIESER Seite nachgeladen – zwei Sammelabfragen statt N+1, unabhängig von
 * der Gesamtgröße des Vereins.
 *
 * @param {object} [opts]
 * @param {string} [opts.search]   Freitext: Vor-/Nachname, E-Mail oder
 *                                 Mitgliedsnummer (= users.id).
 * @param {string} [opts.role]     Genau eine Rolle, sonst alle.
 * @param {'active'|'inactive'} [opts.status]  Gesperrt/aktiv, sonst alle.
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=20]
 * @returns {Promise<{ users: object[], total: number, page: number,
 *                     pageSize: number, pageCount: number }>}
 */
async function listPageWithProfiles(
  { search, role, status, page = 1, pageSize = 20 } = {},
  runner = pool
) {
  const where = [];
  const params = [];

  if (search) {
    // CONCAT über beide Namensteile, damit auch "Anna Müller" trifft und
    // nicht nur "Anna" oder "Müller".
    where.push(
      `(u.first_name LIKE ? OR u.last_name LIKE ?
        OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?
        OR u.email LIKE ? OR CAST(u.id AS CHAR) LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (role) {
    where.push('u.role = ?');
    params.push(role);
  }
  if (status === 'active') where.push('u.is_approved = 1');
  else if (status === 'inactive') where.push('u.is_approved = 0');

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [[countRow]] = await runner.query(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params
  );
  const total = Number(countRow.total);

  // Seite begrenzen: nach einer Filterung kann die zuvor gewählte Seite
  // ausserhalb des Bereichs liegen – dann die letzte vorhandene liefern,
  // statt eine leere Tabelle zu zeigen.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const offset = (safePage - 1) * pageSize;

  const [rows] = await runner.query(
    `SELECT ${PUBLIC_COLUMNS.split(', ').map((c) => `u.${c}`).join(', ')}
       FROM users u
       ${whereSql}
      ORDER BY u.last_name, u.first_name, u.id
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  if (rows.length === 0) {
    return { users: [], total, page: safePage, pageSize, pageCount };
  }

  const ids = rows.map((row) => row.id);
  const [memberships] = await runner.query(
    `SELECT ut.user_id, ut.relation_type, t.id, t.code, t.name
       FROM user_teams ut
       JOIN teams t ON t.id = ut.team_id
      WHERE ut.user_id IN (?)
      ORDER BY t.sort_order, t.name`,
    [ids]
  );
  const [services] = await runner.query(
    'SELECT user_id, service_type FROM user_services WHERE user_id IN (?) ORDER BY service_type',
    [ids]
  );

  const teamsByUser = groupBy(memberships, 'user_id', (m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    relationType: m.relation_type,
  }));
  const servicesByUser = groupBy(services, 'user_id', (s) => s.service_type);

  return {
    users: rows.map((row) =>
      toProfile(row, teamsByUser.get(row.id) ?? [], servicesByUser.get(row.id) ?? [])
    ),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

/**
 * Kennzahlen der Mitgliederverwaltung: Gesamtzahl, Verteilung nach Rolle,
 * gesperrte Konten und Neuzugänge der letzten 30 Tage.
 *
 * Eine Abfrage statt fünf – die Zahlen stehen im Kopf der Verwaltung und
 * sollen den Seitenaufbau nicht ausbremsen.
 */
async function getMemberStats(runner = pool) {
  const [[row]] = await runner.query(
    `SELECT COUNT(*)                                        AS total,
            SUM(is_approved = 1)                            AS active,
            SUM(is_approved = 0)                            AS inactive,
            SUM(created_at >= NOW() - INTERVAL 30 DAY)      AS recent
       FROM users`
  );
  const [roleRows] = await runner.query(
    'SELECT role, COUNT(*) AS count FROM users GROUP BY role'
  );

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    inactive: Number(row?.inactive ?? 0),
    recent: Number(row?.recent ?? 0),
    byRole: roleRows.map((r) => ({ role: r.role, count: Number(r.count) })),
  };
}

// --- Schreiben ---------------------------------------------------------------

/**
 * Legt ein neues Konto samt Mannschaften und Diensten an – alles in EINER
 * Transaktion. Wirft `ER_DUP_ENTRY`, wenn die E-Mail bereits existiert
 * (der Controller macht daraus ein 409).
 *
 * @param {object} p
 * @param {{ firstName, lastName, email, passwordHash }} p.account
 * @param {{ teamId:number, relationType:string }[]} p.relations
 * @param {string[]} p.services
 * @returns {Promise<number>} die neue user id
 */
async function createWithProfile({ account, relations, services }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // is_approved wird bewusst NICHT gesetzt -> Spalten-Default 1 (aktiv).
    // Es gibt keine Registrierungs-Freigabe mehr; `is_approved = 0` ist
    // ausschliesslich eine spätere Admin-Sperre.
    const [result] = await conn.query(
      `INSERT INTO users (first_name, last_name, email, password_hash)
       VALUES (?, ?, ?, ?)`,
      [account.firstName, account.lastName, account.email, account.passwordHash]
    );
    const userId = result.insertId;

    await teamRepository.insertRelations(conn, userId, relations);
    await serviceRepository.replaceForUser(conn, userId, services);

    await conn.commit();
    return userId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Wendet eine Admin-Änderung an – alles in EINER Transaktion.
 * Alle drei Bestandteile sind optional (nur mitgeben, was sich ändern soll).
 *
 * @param {object} change
 * @param {{ role?: string, is_approved?: 0|1 }} [change.accountFields]
 * @param {number[]} [change.playerTeamIds]  vollständige neue Spieler-Zuordnung
 * @param {string[]} [change.services]        vollständige neue Dienstliste
 */
// Nur diese Spalten dürfen über applyAdminChange geschrieben werden.
// Defense-in-depth: verhindert SQL-Injection über Spaltennamen, falls
// validateUserPatch je erweitert wird.
const WRITABLE_USER_COLUMNS = new Set(['role', 'is_approved']);

async function applyAdminChange(userId, { accountFields, playerTeamIds, services }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (accountFields && Object.keys(accountFields).length > 0) {
      const cols = Object.keys(accountFields);
      const unknown = cols.filter((c) => !WRITABLE_USER_COLUMNS.has(c));
      if (unknown.length > 0) {
        throw new Error(`Nicht erlaubte Spalte(n): ${unknown.join(', ')}`);
      }
      await conn.query(
        `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => accountFields[c]), userId]
      );
    }

    // Steuert bewusst nur die `player`-Zuordnung; `coach`/`fan` laufen über die
    // Mannschaftsseite.
    if (playerTeamIds !== undefined) {
      await teamRepository.replaceRelationTeams(conn, userId, playerTeamIds, 'player');
    }
    if (services !== undefined) {
      await serviceRepository.replaceForUser(conn, userId, services);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// --- intern ---------------------------------------------------------------

function groupBy(rows, keyField, mapFn) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(mapFn(row));
  }
  return map;
}

module.exports = {
  findByEmail,
  findById,
  countActiveAdmins,
  promoteToTrainerIfBasic,
  buildProfile,
  getFullProfile,
  listAllWithProfiles,
  listPageWithProfiles,
  getMemberStats,
  createWithProfile,
  applyAdminChange,
};
