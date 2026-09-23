// Datenzugriff für Rückmeldungen (`attendances`) und dauerhafte Abwesenheiten
// (`long_term_absences`). Enthält AUSSCHLIESSLICH SQL.
//
// Die fachliche Auswertung („zählt als zugesagt oder abgesagt?") steckt
// bewusst NICHT hier, sondern in services/attendanceService.js: Sie vergleicht
// Zeitstempel und ist damit Logik, keine Datenhaltung.
const pool = require('../config/db');

/** Zeitstempel als Text – siehe Zeitzonen-Hinweis in eventRepository.js. */
const ATTENDANCE_COLUMNS = `
  a.id, a.event_id, a.user_id, a.status, a.reason, a.set_by_user_id,
  DATE_FORMAT(a.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at`;

const ABSENCE_COLUMNS = `
  la.id, la.user_id, la.team_id, la.type, la.note,
  DATE_FORMAT(la.start_date, '%Y-%m-%d')          AS start_date,
  DATE_FORMAT(la.end_date,   '%Y-%m-%d')          AS end_date,
  DATE_FORMAT(la.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at`;

function mapAttendance(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status,
    reason: row.reason ?? null,
    setByUserId: row.set_by_user_id ?? null,
    updatedAt: row.updated_at,
  };
}

function mapAbsence(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teamId: row.team_id ?? null,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note ?? null,
    createdAt: row.created_at,
    ...(row.first_name
      ? { firstName: row.first_name, lastName: row.last_name }
      : {}),
  };
}

// --- Rückmeldungen ----------------------------------------------------------

/** Alle ausdrücklichen Rückmeldungen zu den angegebenen Terminen. */
async function listForEvents(eventIds, runner = pool) {
  if (eventIds.length === 0) return [];
  const [rows] = await runner.query(
    `SELECT ${ATTENDANCE_COLUMNS} FROM attendances a WHERE a.event_id IN (?)`,
    [eventIds]
  );
  return rows.map(mapAttendance);
}

/** Rückmeldungen EINER Person zu den angegebenen Terminen. */
async function listForUserAndEvents(userId, eventIds, runner = pool) {
  if (eventIds.length === 0) return [];
  const [rows] = await runner.query(
    `SELECT ${ATTENDANCE_COLUMNS}
       FROM attendances a
      WHERE a.user_id = ? AND a.event_id IN (?)`,
    [userId, eventIds]
  );
  return rows.map(mapAttendance);
}

/**
 * Zu-/Absage speichern. Pro (Termin, Person) gibt es höchstens eine Zeile
 * (UNIQUE-Index) – ein erneutes Antworten überschreibt die alte Angabe.
 *
 * `updated_at` wird ausdrücklich mitgesetzt: MySQL aktualisiert ON UPDATE
 * nicht, wenn sich kein Wert ändert – „ich sage nochmal zu" muss die Angabe
 * aber wieder jünger machen als eine zwischenzeitlich eingetragene
 * Abwesenheit (siehe services/attendanceService.js).
 */
async function upsert(
  { eventId, userId, status, reason, setByUserId },
  runner = pool
) {
  const [result] = await runner.query(
    `INSERT INTO attendances (event_id, user_id, status, reason, set_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       reason = VALUES(reason),
       set_by_user_id = VALUES(set_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [eventId, userId, status, reason, setByUserId]
  );
  return result;
}

// --- Dauerhafte Abwesenheiten ----------------------------------------------

/**
 * Abwesenheiten mehrerer Personen, die einen Zeitraum ÜBERSCHNEIDEN.
 *
 * `team_id IS NULL` gilt für alle Mannschaften der Person – deshalb steht das
 * OR in der Bedingung.
 *
 * @param {number[]} userIds
 * @param {number|null} teamId  null = Mannschaft egal (alle Einträge)
 * @param {string} fromDate `YYYY-MM-DD`
 * @param {string} toDate   `YYYY-MM-DD`
 */
async function listOverlapping(
  { userIds, teamId = null, fromDate, toDate },
  runner = pool
) {
  if (userIds.length === 0) return [];

  const params = [userIds];
  let teamClause = '';
  if (teamId !== null) {
    teamClause = 'AND (la.team_id IS NULL OR la.team_id = ?)';
    params.push(teamId);
  }
  params.push(toDate, fromDate);

  const [rows] = await runner.query(
    `SELECT ${ABSENCE_COLUMNS}
       FROM long_term_absences la
      WHERE la.user_id IN (?)
        ${teamClause}
        AND la.start_date <= ?
        AND la.end_date   >= ?
      ORDER BY la.start_date, la.id`,
    params
  );
  return rows.map(mapAbsence);
}

/**
 * Alle Abwesenheiten einer Person, jüngste zuerst.
 * @param {{ fromDate?: string|null }} [opts] nur Einträge, die an oder nach
 *   diesem Tag enden (blendet abgelaufene Einträge aus).
 */
async function listForUser(userId, { fromDate = null } = {}, runner = pool) {
  const params = [userId];
  let clause = '';
  if (fromDate) {
    clause = 'AND la.end_date >= ?';
    params.push(fromDate);
  }

  const [rows] = await runner.query(
    `SELECT ${ABSENCE_COLUMNS}
       FROM long_term_absences la
      WHERE la.user_id = ? ${clause}
      ORDER BY la.start_date DESC, la.id DESC`,
    params
  );
  return rows.map(mapAbsence);
}

/**
 * Laufende und künftige Abwesenheiten aller Spieler:innen einer Mannschaft –
 * für die Kader-Übersicht des Trainers.
 */
async function listForTeam(teamId, fromDate, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${ABSENCE_COLUMNS}, u.first_name, u.last_name
       FROM long_term_absences la
       JOIN users u ON u.id = la.user_id
       JOIN user_teams ut
         ON ut.user_id = la.user_id
        AND ut.team_id = ?
        AND ut.relation_type = 'player'
        AND ut.is_confirmed = 1
      WHERE (la.team_id IS NULL OR la.team_id = ?)
        AND la.end_date >= ?
      ORDER BY la.start_date, u.last_name, u.first_name`,
    [teamId, teamId, fromDate]
  );
  return rows.map(mapAbsence);
}

/** Eine Abwesenheit per id. null wenn unbekannt. */
async function findAbsenceById(id, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${ABSENCE_COLUMNS} FROM long_term_absences la WHERE la.id = ?`,
    [id]
  );
  return rows[0] ? mapAbsence(rows[0]) : null;
}

/**
 * Abwesenheit anlegen.
 * @returns {Promise<number>} id des neuen Eintrags
 */
async function createAbsence({ userId, fields }, runner = pool) {
  const [result] = await runner.query(
    `INSERT INTO long_term_absences
       (user_id, team_id, type, start_date, end_date, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      fields.team_id,
      fields.type,
      fields.start_date,
      fields.end_date,
      fields.note,
    ]
  );
  return result.insertId;
}

/** Abwesenheit löschen. */
async function deleteAbsence(id, runner = pool) {
  const [result] = await runner.query(
    'DELETE FROM long_term_absences WHERE id = ?',
    [id]
  );
  return result.affectedRows;
}

module.exports = {
  listForEvents,
  listForUserAndEvents,
  upsert,
  listOverlapping,
  listForUser,
  listForTeam,
  findAbsenceById,
  createAbsence,
  deleteAbsence,
};
