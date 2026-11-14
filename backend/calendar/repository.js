// SQL für Kalender-Export und -Abo.
const crypto = require('crypto');
const pool = require('../config/db');

/** Konto zur Abo-Adresse. Gesperrte Konten bekommen nichts. */
async function findUserByToken(token) {
  const [rows] = await pool.query(
    'SELECT id, role, first_name FROM users WHERE calendar_token = ? AND is_approved = 1',
    [token]
  );
  return rows[0] ?? null;
}

async function getToken(userId) {
  const [[row]] = await pool.query('SELECT calendar_token FROM users WHERE id = ?', [userId]);
  return row?.calendar_token ?? null;
}

/** Neuen Schlüssel setzen. Die alte Abo-Adresse ist damit ungültig. */
async function renewToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('UPDATE users SET calendar_token = ? WHERE id = ?', [token, userId]);
  return token;
}

/** Eigene Dienste aus veröffentlichten Plänen im Zeitraum. */
async function listOwnDuties(userId, fromSql, toSql) {
  const [rows] = await pool.query(
    `SELECT d.id, d.title,
            DATE_FORMAT(d.start_time, '%Y-%m-%dT%H:%i:%s') AS start_time,
            DATE_FORMAT(d.end_time,   '%Y-%m-%dT%H:%i:%s') AS end_time,
            p.title AS plan_title, p.location
       FROM duty_assignments a
       JOIN duties d ON d.id = a.duty_id
       JOIN duty_plans p ON p.id = d.plan_id
      WHERE a.user_id = ? AND p.status = 'published'
        AND d.end_time >= ? AND d.start_time <= ?
      ORDER BY d.start_time
      LIMIT 2000`,
    [userId, fromSql, toSql]
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    planTitle: row.plan_title,
    location: row.location ?? null,
  }));
}

module.exports = { findUserByToken, getToken, renewToken, listOwnDuties };
