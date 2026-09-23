// Datenzugriff für Termine (`events`) und Trainingsserien (`event_series`).
// Enthält AUSSCHLIESSLICH SQL – keine Validierung, keine HTTP-Logik.
// Rückgaben sind bereits camelCase für das Frontend aufbereitet.
//
// Zeiten: `start_time`/`end_time` sind DATETIME in ORTSZEIT. Sie werden
// bewusst als Zeichenkette `YYYY-MM-DDTHH:MM:SS` ausgelesen statt als
// JS-`Date`. Ein Date würde beim JSON-Serialisieren nach UTC umgerechnet –
// aus dem Training um 19:00 Uhr würde je nach Serverzeitzone 17:00 Uhr.
const pool = require('../config/db');
const { maskToWeekdays } = require('../utils/schedule');

// Nur diese Spalten dürfen geschrieben werden. Defense-in-depth wie in
// teamRepository: Spaltennamen werden ins UPDATE interpoliert (Werte laufen
// über ?), deshalb dürfen sie NIE aus einer Anfrage stammen.
const WRITABLE_EVENT_COLUMNS = new Set([
  'title',
  'location',
  'type',
  'start_time',
  'end_time',
  'reasons_visible_to_all',
]);

const EVENT_COLUMNS = `
  e.id, e.team_id, e.series_id, e.title, e.type, e.location,
  DATE_FORMAT(e.start_time, '%Y-%m-%dT%H:%i:%s') AS start_time,
  DATE_FORMAT(e.end_time,   '%Y-%m-%dT%H:%i:%s') AS end_time,
  e.reasons_visible_to_all, e.created_by`;

// DATE-Spalten ebenfalls als Text: ein JS-`Date` würde beim JSON-Serialisieren
// in UTC umgerechnet und könnte dabei einen Tag zurückrutschen.
const SERIES_COLUMNS = `
  s.id, s.team_id, s.title, s.type, s.location, s.weekdays,
  s.start_time, s.end_time,
  DATE_FORMAT(s.starts_on, '%Y-%m-%d') AS starts_on,
  DATE_FORMAT(s.ends_on,   '%Y-%m-%d') AS ends_on,
  s.reasons_visible_to_all`;

function assertWritableColumns(keys) {
  const unknown = keys.filter((key) => !WRITABLE_EVENT_COLUMNS.has(key));
  if (unknown.length > 0) {
    throw new Error(`Nicht erlaubte Spalte(n): ${unknown.join(', ')}`);
  }
}

/** DB-Zeile eines Termins -> camelCase fürs Frontend. */
function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    teamCode: row.team_code ?? null,
    teamName: row.team_name ?? null,
    seriesId: row.series_id ?? null,
    title: row.title,
    type: row.type,
    location: row.location ?? null,
    startTime: row.start_time,
    endTime: row.end_time,
    reasonsVisibleToAll: Boolean(row.reasons_visible_to_all),
  };
}

/** DB-Zeile einer Serie -> camelCase (Wochentage als ISO-Liste). */
function mapSeries(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    title: row.title,
    type: row.type,
    location: row.location ?? null,
    weekdays: maskToWeekdays(row.weekdays),
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    reasonsVisibleToAll: Boolean(row.reasons_visible_to_all),
    eventCount: row.event_count ?? null,
    upcomingCount: row.upcoming_count ?? null,
  };
}

// --- Lesen ------------------------------------------------------------------

/** Ein Termin samt Mannschaftsnamen. null wenn unbekannt. */
async function findById(id, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${EVENT_COLUMNS}, t.code AS team_code, t.name AS team_name
       FROM events e
       JOIN teams t ON t.id = e.team_id
      WHERE e.id = ?`,
    [id]
  );
  return mapEvent(rows[0]);
}

/**
 * Termine mehrerer Mannschaften in einem Zeitraum.
 *
 * Ein Termin zählt zum Zeitraum, sobald er ihn ÜBERSCHNEIDET – ein
 * dreitägiges Camp taucht damit auch dann auf, wenn nur sein letzter Tag im
 * gewählten Fenster liegt.
 *
 * @param {number[]} teamIds
 * @param {string} fromSql `YYYY-MM-DD HH:MM:SS`
 * @param {string} toSql   `YYYY-MM-DD HH:MM:SS`
 */
async function listForTeams(teamIds, fromSql, toSql, runner = pool) {
  if (teamIds.length === 0) return [];
  const [rows] = await runner.query(
    `SELECT ${EVENT_COLUMNS}, t.code AS team_code, t.name AS team_name
       FROM events e
       JOIN teams t ON t.id = e.team_id
      WHERE e.team_id IN (?)
        AND e.end_time >= ?
        AND e.start_time <= ?
      ORDER BY e.start_time, e.id`,
    [teamIds, fromSql, toSql]
  );
  return rows.map(mapEvent);
}

/** Alle Serien einer Mannschaft inkl. Anzahl erzeugter/künftiger Termine. */
async function listSeriesForTeam(teamId, nowSql, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${SERIES_COLUMNS},
            (SELECT COUNT(*) FROM events e WHERE e.series_id = s.id) AS event_count,
            (SELECT COUNT(*) FROM events e
              WHERE e.series_id = s.id AND e.start_time >= ?) AS upcoming_count
       FROM event_series s
      WHERE s.team_id = ?
      ORDER BY s.starts_on DESC, s.id DESC`,
    [nowSql, teamId]
  );
  return rows.map(mapSeries);
}

/** Eine Serie per id. null wenn unbekannt. */
async function findSeriesById(id, runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${SERIES_COLUMNS} FROM event_series s WHERE s.id = ?`,
    [id]
  );
  return mapSeries(rows[0]);
}

// --- Schreiben --------------------------------------------------------------

/**
 * Legt einen Einzeltermin an.
 * @returns {Promise<number>} id des neuen Termins
 */
async function createEvent(
  { teamId, seriesId = null, fields, startTime, endTime, createdBy },
  runner = pool
) {
  const [result] = await runner.query(
    `INSERT INTO events
       (team_id, series_id, title, type, location, start_time, end_time,
        reasons_visible_to_all, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      teamId,
      seriesId,
      fields.title,
      fields.type,
      fields.location,
      startTime,
      endTime,
      fields.reasons_visible_to_all,
      createdBy,
    ]
  );
  return result.insertId;
}

/**
 * Legt Serienregel und alle daraus folgenden Termine in EINER Transaktion an.
 * Entweder steht am Ende die komplette Serie in der Datenbank oder gar nichts.
 *
 * @param {{startTime:string, endTime:string}[]} occurrences
 * @returns {Promise<{ seriesId:number, created:number }>}
 */
async function createSeriesWithEvents({
  teamId,
  fields,
  rule,
  occurrences,
  createdBy,
}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [seriesResult] = await conn.query(
      `INSERT INTO event_series
         (team_id, title, type, location, weekdays, start_time, end_time,
          starts_on, ends_on, reasons_visible_to_all, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        teamId,
        fields.title,
        fields.type,
        fields.location,
        rule.weekdays,
        rule.start_time,
        rule.end_time,
        rule.starts_on,
        rule.ends_on,
        fields.reasons_visible_to_all,
        createdBy,
      ]
    );
    const seriesId = seriesResult.insertId;

    const [eventResult] = await conn.query(
      `INSERT INTO events
         (team_id, series_id, title, type, location, start_time, end_time,
          reasons_visible_to_all, created_by)
       VALUES ?`,
      [
        occurrences.map((occurrence) => [
          teamId,
          seriesId,
          fields.title,
          fields.type,
          fields.location,
          occurrence.startTime,
          occurrence.endTime,
          fields.reasons_visible_to_all,
          createdBy,
        ]),
      ]
    );

    await conn.commit();
    return { seriesId, created: eventResult.affectedRows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Einzelnen Termin ändern. `fields` enthält bereits geprüfte Spaltennamen.
 * @returns {Promise<number>} Anzahl geänderter Zeilen
 */
async function updateEvent(id, fields, runner = pool) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  assertWritableColumns(keys);

  const [result] = await runner.query(
    `UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => fields[k]), id]
  );
  return result.affectedRows;
}

/**
 * Ändert alle NOCH NICHT BEGONNENEN Termine einer Serie sowie die Regel
 * selbst. Vergangene Einheiten bleiben unangetastet – sie sind Historie.
 *
 * @param {object} fields nur Stammdaten (Titel, Ort, Art, Sichtbarkeit)
 * @returns {Promise<number>} Anzahl geänderter Termine
 */
async function updateSeriesAndFutureEvents(seriesId, fields, nowSql) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  assertWritableColumns(keys);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE event_series SET ${keys.map((k) => `${k} = ?`).join(', ')}
        WHERE id = ?`,
      [...keys.map((k) => fields[k]), seriesId]
    );

    const [result] = await conn.query(
      `UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')}
        WHERE series_id = ? AND start_time >= ?`,
      [...keys.map((k) => fields[k]), seriesId, nowSql]
    );

    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Einen Termin löschen (Rückmeldungen gehen per ON DELETE CASCADE mit). */
async function deleteEvent(id, runner = pool) {
  const [result] = await runner.query('DELETE FROM events WHERE id = ?', [id]);
  return result.affectedRows;
}

/**
 * Beendet eine Serie: löscht die Regel und alle noch nicht begonnenen
 * Termine. Vergangene Einheiten bleiben stehen (ihr `series_id` wird durch
 * ON DELETE SET NULL geleert) – die Historie darf nicht verschwinden.
 *
 * @returns {Promise<number>} Anzahl gelöschter künftiger Termine
 */
async function deleteSeries(seriesId, nowSql) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'DELETE FROM events WHERE series_id = ? AND start_time >= ?',
      [seriesId, nowSql]
    );
    await conn.query('DELETE FROM event_series WHERE id = ?', [seriesId]);

    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  findById,
  listForTeams,
  listSeriesForTeam,
  findSeriesById,
  createEvent,
  createSeriesWithEvents,
  updateEvent,
  updateSeriesAndFutureEvents,
  deleteEvent,
  deleteSeries,
};
