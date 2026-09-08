// Hilfsfunktionen für Helferdienste (user_services).
const pool = require('../config/db');
const { SERVICE_TYPES } = require('./roles');

/**
 * Prüft und normalisiert eine Liste von Helferdiensten aus einem Request.
 *
 * @returns {{ ok: true, services: string[] | undefined } | { ok: false, message: string }}
 *   `services === undefined` bedeutet: Feld war nicht im Request enthalten.
 */
function normalizeServices(services) {
  if (services === undefined) return { ok: true, services: undefined };

  if (!Array.isArray(services)) {
    return { ok: false, message: 'services muss eine Liste sein.' };
  }

  const unique = [...new Set(services)];
  if (unique.some((service) => !SERVICE_TYPES.includes(service))) {
    return {
      ok: false,
      message: `Ungültiger Helferdienst. Erlaubt: ${SERVICE_TYPES.join(', ')}.`,
    };
  }

  return { ok: true, services: unique };
}

/**
 * Lädt die Helferdienste eines Nutzers.
 */
async function loadServicesForUser(userId, runner = pool) {
  const [rows] = await runner.query(
    'SELECT service_type FROM user_services WHERE user_id = ? ORDER BY service_type',
    [userId]
  );
  return rows.map((row) => row.service_type);
}

/**
 * Setzt die Helferdienste eines Nutzers auf exakt `services`.
 * (Innerhalb einer bestehenden Transaktion auszuführen.)
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function replaceUserServices(conn, userId, services) {
  await conn.query('DELETE FROM user_services WHERE user_id = ?', [userId]);
  if (services.length > 0) {
    await conn.query(
      'INSERT INTO user_services (user_id, service_type) VALUES ?',
      [services.map((service) => [userId, service])]
    );
  }
}

module.exports = {
  normalizeServices,
  loadServicesForUser,
  replaceUserServices,
};
