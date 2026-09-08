// Datenzugriff für Helferdienste (Tabelle `user_services`).
// Enthält AUSSCHLIESSLICH SQL – keine Validierung, keine HTTP-Logik.
const pool = require('../config/db');

/**
 * Liefert die Helferdienste eines Nutzers als String-Array.
 * @returns {Promise<string[]>} z. B. ['zeitnehmer']
 */
async function getForUser(userId, runner = pool) {
  const [rows] = await runner.query(
    'SELECT service_type FROM user_services WHERE user_id = ? ORDER BY service_type',
    [userId]
  );
  return rows.map((row) => row.service_type);
}

/**
 * Setzt die Helferdienste eines Nutzers auf exakt `services`
 * (alte werden gelöscht). Muss innerhalb einer Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function replaceForUser(conn, userId, services) {
  await conn.query('DELETE FROM user_services WHERE user_id = ?', [userId]);
  if (services.length > 0) {
    await conn.query(
      'INSERT INTO user_services (user_id, service_type) VALUES ?',
      [services.map((service) => [userId, service])]
    );
  }
}

module.exports = { getForUser, replaceForUser };
