// SQL des Dienstplans. Schreibt nur in duty_plans, duties, duty_assignments
// (users.wants_duties gibt es seit Migration 035 nicht mehr). Zeiten kommen als Text `YYYY-MM-DDTHH:MM:SS`
// (Ortszeit) zurück, aus demselben Grund wie im eventRepository.
const pool = require('../config/db');
const { publicUrlFor } = require('../config/uploads');

const DUTY_COLUMNS = `
  d.id, d.plan_id, d.category, d.title, d.capacity,
  DATE_FORMAT(d.start_time, '%Y-%m-%dT%H:%i:%s') AS start_time,
  DATE_FORMAT(d.end_time,   '%Y-%m-%dT%H:%i:%s') AS end_time`;

const PLAN_COLUMNS = `
  p.id, p.title, p.location, p.notes, p.status, p.created_by,
  DATE_FORMAT(p.published_at, '%Y-%m-%dT%H:%i:%s') AS published_at`;

// Defense-in-depth: Spaltennamen werden ins UPDATE interpoliert.
const WRITABLE_PLAN = new Set(['title', 'location', 'notes']);
const WRITABLE_DUTY = new Set(['title', 'category', 'start_time', 'end_time', 'capacity']);

function assertColumns(fields, allowed) {
  const bad = Object.keys(fields).filter((key) => !allowed.has(key));
  if (bad.length > 0) throw new Error(`Nicht erlaubte Spalte(n): ${bad.join(', ')}`);
}

function mapDuty(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    category: row.category,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
  };
}

function mapPlan(row) {
  return {
    id: row.id,
    title: row.title,
    location: row.location ?? null,
    notes: row.notes ?? null,
    status: row.status,
    publishedAt: row.published_at ?? null,
    createdBy: row.created_by ?? null,
  };
}

// --- Personen ---------------------------------------------------------------

/** Rolle und Helferdienste – das, was categories.canTake braucht. */
async function findPerson(userId, runner = pool) {
  const [[user]] = await runner.query(
    'SELECT id, role, first_name, last_name FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return null;
  const [services] = await runner.query(
    'SELECT service_type FROM user_services WHERE user_id = ?',
    [userId]
  );
  return {
    id: user.id,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name,
    services: services.map((row) => row.service_type),
  };
}

/** Alle aktiven Konten samt Rolle und Helferdiensten (Empfänger neuer Dienstpläne). */
async function listVolunteers() {
  const [users] = await pool.query('SELECT id, role FROM users WHERE is_approved = 1');
  if (users.length === 0) return [];
  const [services] = await pool.query(
    `SELECT us.user_id, us.service_type
       FROM user_services us
       JOIN users u ON u.id = us.user_id
      WHERE u.is_approved = 1`
  );
  const byUser = new Map();
  for (const row of services) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row.service_type);
  }
  return users.map((user) => ({ id: user.id, role: user.role, services: byUser.get(user.id) ?? [] }));
}

// --- Lesen ------------------------------------------------------------------

/**
 * Veröffentlichte Dienste, die im Zeitraum liegen (Ende nach `fromSql`,
 * Beginn vor `toSql`). `toSql` null = ohne Ende.
 */
async function listPublishedDuties(fromSql, toSql, limit = 1000) {
  const [rows] = await pool.query(
    `SELECT ${DUTY_COLUMNS}
       FROM duties d
       JOIN duty_plans p ON p.id = d.plan_id AND p.status = 'published'
      WHERE d.end_time > ? ${toSql ? 'AND d.start_time <= ?' : ''}
      ORDER BY d.start_time, d.id
      LIMIT ?`,
    toSql ? [fromSql, toSql, limit] : [fromSql, limit]
  );
  return rows.map(mapDuty);
}

async function findPlansByIds(ids) {
  if (ids.length === 0) return [];
  const [rows] = await pool.query(`SELECT ${PLAN_COLUMNS} FROM duty_plans p WHERE p.id IN (?)`, [ids]);
  return rows.map(mapPlan);
}

async function findPlan(id, runner = pool) {
  const [rows] = await runner.query(`SELECT ${PLAN_COLUMNS} FROM duty_plans p WHERE p.id = ?`, [id]);
  return rows[0] ? mapPlan(rows[0]) : null;
}

async function listPlanDuties(planId, runner = pool, { forUpdate = false } = {}) {
  const [rows] = await runner.query(
    `SELECT ${DUTY_COLUMNS} FROM duties d WHERE d.plan_id = ? ORDER BY d.start_time, d.id${
      forUpdate ? ' FOR UPDATE' : ''
    }`,
    [planId]
  );
  return rows.map(mapDuty);
}

/**
 * Alle Pläne für die Verwaltung mit Kennzahlen. Ohne `includePast` nur Pläne,
 * die noch einen kommenden Dienst haben oder (noch) leer sind.
 */
async function listPlanSummaries({ includePast = false, nowSql }) {
  const [rows] = await pool.query(
    `SELECT ${PLAN_COLUMNS},
            COUNT(d.id) AS duty_count,
            COALESCE(SUM(d.capacity), 0) AS slots,
            COALESCE(SUM(a.taken), 0) AS taken,
            DATE_FORMAT(MIN(d.start_time), '%Y-%m-%dT%H:%i:%s') AS first_start,
            DATE_FORMAT(MAX(d.end_time), '%Y-%m-%dT%H:%i:%s') AS last_end
       FROM duty_plans p
       LEFT JOIN duties d ON d.plan_id = p.id
       LEFT JOIN (SELECT duty_id, COUNT(*) AS taken FROM duty_assignments GROUP BY duty_id) a
              ON a.duty_id = d.id
      GROUP BY p.id
      ${includePast ? '' : 'HAVING MAX(d.end_time) IS NULL OR MAX(d.end_time) > ?'}
      ORDER BY MIN(d.start_time) IS NULL DESC, MIN(d.start_time), p.id`,
    includePast ? [] : [nowSql]
  );
  return rows.map((row) => ({
    ...mapPlan(row),
    dutyCount: Number(row.duty_count),
    slots: Number(row.slots),
    taken: Number(row.taken),
    firstStart: row.first_start ?? null,
    lastEnd: row.last_end ?? null,
  }));
}

/** Eingetragene Personen zu den Diensten, mit Name und Bild. */
async function listAssignments(dutyIds) {
  if (dutyIds.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT a.duty_id, a.user_id, u.first_name, u.last_name, u.photo_path,
            DATE_FORMAT(a.claimed_at, '%Y-%m-%dT%H:%i:%s.%f') AS claimed_at
       FROM duty_assignments a
       JOIN users u ON u.id = a.user_id
      WHERE a.duty_id IN (?)
      ORDER BY a.claimed_at, a.user_id`,
    [dutyIds]
  );
  return rows.map((row) => ({
    dutyId: row.duty_id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: publicUrlFor(row.photo_path),
    claimedAt: row.claimed_at ? row.claimed_at.slice(0, 23) : null,
  }));
}

async function listAssigneeIds(dutyIds, runner = pool) {
  if (dutyIds.length === 0) return [];
  const [rows] = await runner.query(
    'SELECT DISTINCT user_id FROM duty_assignments WHERE duty_id IN (?)',
    [dutyIds]
  );
  return rows.map((row) => row.user_id);
}

/** Dienste einer Person, die sich mit dem Zeitraum überschneiden. */
async function findOverlapping(conn, userId, startSql, endSql, exceptDutyId) {
  const [rows] = await conn.query(
    `SELECT ${DUTY_COLUMNS}
       FROM duty_assignments a
       JOIN duties d ON d.id = a.duty_id
      WHERE a.user_id = ? AND d.id <> ? AND d.start_time < ? AND d.end_time > ?
      LIMIT 1`,
    [userId, exceptDutyId, endSql, startSql]
  );
  return rows[0] ? mapDuty(rows[0]) : null;
}

/**
 * Dienst lesen. `forUpdate` sperrt die Zeile bis zum Ende der Transaktion –
 * das ist der Schutz gegen gleichzeitige Zusagen auf den letzten Platz.
 */
async function findDuty(id, runner = pool, { forUpdate = false } = {}) {
  if (forUpdate) {
    // Nur die Dienst-Zeile sperren. Ein FOR UPDATE über den JOIN würde auch
    // den Plan sperren und damit alle Zusagen eines Plans hintereinander
    // zwingen.
    const [locked] = await runner.query('SELECT id FROM duties WHERE id = ? FOR UPDATE', [id]);
    if (locked.length === 0) return null;
  }
  const [rows] = await runner.query(
    `SELECT ${DUTY_COLUMNS}, p.status AS plan_status, p.title AS plan_title
       FROM duties d
       JOIN duty_plans p ON p.id = d.plan_id
      WHERE d.id = ?`,
    [id]
  );
  if (!rows[0]) return null;
  return { ...mapDuty(rows[0]), planStatus: rows[0].plan_status, planTitle: rows[0].plan_title };
}

async function countTaken(conn, dutyId) {
  const [[row]] = await conn.query(
    'SELECT COUNT(*) AS taken FROM duty_assignments WHERE duty_id = ?',
    [dutyId]
  );
  return Number(row.taken);
}

async function isAssigned(conn, dutyId, userId) {
  const [rows] = await conn.query(
    'SELECT 1 FROM duty_assignments WHERE duty_id = ? AND user_id = ?',
    [dutyId, userId]
  );
  return rows.length > 0;
}

/** Kommende Dienste (veröffentlicht), die im Fenster beginnen – für Erinnerungen. */
async function listDutiesStartingBetween(fromSql, toSql) {
  const [rows] = await pool.query(
    `SELECT ${DUTY_COLUMNS}, p.title AS plan_title, p.location AS plan_location
       FROM duties d
       JOIN duty_plans p ON p.id = d.plan_id AND p.status = 'published'
      WHERE d.start_time > ? AND d.start_time <= ?
        AND EXISTS (SELECT 1 FROM duty_assignments a WHERE a.duty_id = d.id)`,
    [fromSql, toSql]
  );
  return rows.map((row) => ({
    ...mapDuty(row),
    planTitle: row.plan_title,
    location: row.plan_location ?? null,
  }));
}

// --- Schreiben --------------------------------------------------------------

async function insertPlan(conn, fields, createdBy) {
  const [result] = await conn.query(
    'INSERT INTO duty_plans (title, location, notes, created_by) VALUES (?, ?, ?, ?)',
    [fields.title, fields.location, fields.notes, createdBy]
  );
  return result.insertId;
}

async function insertDuties(conn, planId, duties) {
  if (duties.length === 0) return;
  await conn.query(
    'INSERT INTO duties (plan_id, category, title, start_time, end_time, capacity) VALUES ?',
    [duties.map((d) => [planId, d.category, d.title, d.start_time, d.end_time, d.capacity])]
  );
}

async function countPlanDuties(conn, planId) {
  const [[row]] = await conn.query('SELECT COUNT(*) AS count FROM duties WHERE plan_id = ?', [planId]);
  return Number(row.count);
}

/** Plan-Zeile sperren (Anlegen weiterer Dienste, Veröffentlichen). */
async function lockPlan(conn, planId) {
  const [rows] = await conn.query(`SELECT ${PLAN_COLUMNS} FROM duty_plans p WHERE p.id = ? FOR UPDATE`, [
    planId,
  ]);
  return rows[0] ? mapPlan(rows[0]) : null;
}

async function updatePlan(planId, fields) {
  assertColumns(fields, WRITABLE_PLAN);
  const keys = Object.keys(fields);
  const [result] = await pool.query(
    `UPDATE duty_plans SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => fields[key]), planId]
  );
  return result.affectedRows;
}

/** Entwurf -> veröffentlicht. true, wenn DIESER Aufruf veröffentlicht hat. */
async function publishPlan(conn, planId) {
  const [result] = await conn.query(
    `UPDATE duty_plans SET status = 'published', published_at = COALESCE(published_at, NOW())
      WHERE id = ? AND status = 'draft'`,
    [planId]
  );
  return result.affectedRows === 1;
}

async function deletePlan(planId, runner = pool) {
  const [result] = await runner.query('DELETE FROM duty_plans WHERE id = ?', [planId]);
  return result.affectedRows;
}

async function updateDuty(conn, dutyId, fields) {
  assertColumns(fields, WRITABLE_DUTY);
  const keys = Object.keys(fields);
  await conn.query(
    `UPDATE duties SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((key) => fields[key]), dutyId]
  );
}

async function deleteDuty(conn, dutyId) {
  const [result] = await conn.query('DELETE FROM duties WHERE id = ?', [dutyId]);
  return result.affectedRows;
}

async function insertAssignment(conn, { dutyId, userId, clientTime, assignedBy = null }) {
  await conn.query(
    'INSERT INTO duty_assignments (duty_id, user_id, client_time, assigned_by) VALUES (?, ?, ?, ?)',
    [dutyId, userId, clientTime, assignedBy]
  );
}

async function deleteAssignment(conn, dutyId, userId) {
  const [result] = await conn.query(
    'DELETE FROM duty_assignments WHERE duty_id = ? AND user_id = ?',
    [dutyId, userId]
  );
  return result.affectedRows;
}

/** Konto-Zeile sperren: verhindert, dass dieselbe Person parallel zwei sich überschneidende Dienste bekommt. */
async function lockUser(conn, userId) {
  const [rows] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
  return rows.length > 0;
}

/**
 * Transaktion mit sauberem Rollback.
 *
 * READ COMMITTED: Jede Abfrage sieht den neuesten bestätigten Stand. Unter
 * dem Standard REPEATABLE READ könnte das Zählen der belegten Plätze auf
 * einem Schnappschuss von VOR der Sperre beruhen und eine gerade
 * eingetragene Zusage übersehen.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  findPerson,
  listVolunteers,
  listPublishedDuties,
  findPlansByIds,
  findPlan,
  listPlanDuties,
  listPlanSummaries,
  listAssignments,
  listAssigneeIds,
  findOverlapping,
  findDuty,
  countTaken,
  isAssigned,
  listDutiesStartingBetween,
  insertPlan,
  insertDuties,
  countPlanDuties,
  lockPlan,
  updatePlan,
  publishPlan,
  deletePlan,
  updateDuty,
  deleteDuty,
  insertAssignment,
  deleteAssignment,
  lockUser,
  withTransaction,
};
