// SQL des Push-Moduls. Liest die Kern-Tabellen (users, user_teams, events)
// nur, schreibt ausschließlich in die eigenen push_*-Tabellen.
const crypto = require('crypto');

const pool = require('../config/db');

const hashEndpoint = (endpoint) =>
  crypto.createHash('sha256').update(endpoint).digest('hex');

// --- Geräte -----------------------------------------------------------------

/**
 * Gerät eintragen oder einem anderen Konto übergeben. Meldet sich am selben
 * Handy jemand anderes an, gehört das Gerät ab jetzt dieser Person – sonst
 * bekäme sie die Nachrichten der vorherigen.
 */
async function saveSubscription(userId, { endpoint, p256dh, auth, deviceLabel }) {
  await pool.query(
    `INSERT INTO push_subscriptions
       (user_id, endpoint, endpoint_hash, p256dh, auth, device_label)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       device_label = VALUES(device_label)`,
    [userId, endpoint, hashEndpoint(endpoint), p256dh, auth, deviceLabel]
  );
}

/** Gerät des Kontos entfernen. */
async function deleteSubscription(userId, endpoint) {
  const [result] = await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?',
    [userId, hashEndpoint(endpoint)]
  );
  return result.affectedRows;
}

/** Vom Push-Dienst als ungültig gemeldetes Gerät entfernen. */
async function deleteSubscriptionById(id) {
  await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [id]);
}

async function markDelivered(id) {
  await pool.query('UPDATE push_subscriptions SET last_sent_at = NOW() WHERE id = ?', [id]);
}

async function countSubscriptions(userId) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?',
    [userId]
  );
  return row.count;
}

/**
 * Alle Geräte der genannten AKTIVEN Konten samt Einstellungen – eine Abfrage
 * für eine ganze Mannschaft.
 * @param {number[]} userIds
 */
async function listTargets(userIds) {
  if (userIds.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth, p.settings
       FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id AND u.is_approved = 1
       LEFT JOIN push_preferences p ON p.user_id = s.user_id
      WHERE s.user_id IN (?)`,
    [userIds]
  );
  return rows;
}

/** Alle aktiven Konten mit mindestens einem Gerät (für Vereins-News). */
async function listSubscribedUserIds() {
  const [rows] = await pool.query(
    `SELECT DISTINCT s.user_id
       FROM push_subscriptions s
       JOIN users u ON u.id = s.user_id AND u.is_approved = 1`
  );
  return rows.map((row) => row.user_id);
}

// --- Einstellungen ----------------------------------------------------------

async function getSettings(userId) {
  const [rows] = await pool.query(
    'SELECT settings FROM push_preferences WHERE user_id = ?',
    [userId]
  );
  return rows[0]?.settings ?? null;
}

async function saveSettings(userId, settings) {
  await pool.query(
    `INSERT INTO push_preferences (user_id, settings) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE settings = VALUES(settings)`,
    [userId, JSON.stringify(settings)]
  );
}

// --- Empfänger aus dem Kern -------------------------------------------------

/**
 * Bestätigte Mitglieder einer Mannschaft mit den genannten Beziehungen.
 * Fans bekommen bewusst keine Termin-Nachrichten – sie sehen die Termine auch
 * in der App nicht (siehe services/teamAccess).
 */
async function listTeamUserIds(teamId, relationTypes = ['player', 'coach']) {
  const [rows] = await pool.query(
    `SELECT DISTINCT user_id FROM user_teams
      WHERE team_id = ? AND is_confirmed = 1 AND relation_type IN (?)`,
    [teamId, relationTypes]
  );
  return rows.map((row) => row.user_id);
}

/** Offene Beitrittsanfragen (Spieler:in/Trainer:in) eines Kontos. */
async function listPendingRequests(userId) {
  const [rows] = await pool.query(
    `SELECT ut.team_id, ut.relation_type, t.code AS team_code, t.name AS team_name,
            u.first_name, u.last_name
       FROM user_teams ut
       JOIN teams t ON t.id = ut.team_id
       JOIN users u ON u.id = ut.user_id
      WHERE ut.user_id = ? AND ut.is_confirmed = 0
        AND ut.relation_type IN ('player', 'coach')`,
    [userId]
  );
  return rows;
}

async function findUserName(userId) {
  const [rows] = await pool.query(
    'SELECT first_name, last_name FROM users WHERE id = ?',
    [userId]
  );
  return rows[0] ?? null;
}

async function findTeam(teamId) {
  const [rows] = await pool.query('SELECT id, code, name FROM teams WHERE id = ?', [
    teamId,
  ]);
  return rows[0] ?? null;
}

/**
 * Termine, die im Fenster beginnen und nicht abgesagt sind (für Erinnerungen).
 * Zeiten als `YYYY-MM-DD HH:MM:SS` in Ortszeit.
 */
async function listEventIdsStartingBetween(fromSql, toSql) {
  const [rows] = await pool.query(
    `SELECT id FROM events
      WHERE cancelled_at IS NULL AND start_time > ? AND start_time <= ?`,
    [fromSql, toSql]
  );
  return rows.map((row) => row.id);
}

// --- Einmal-Protokoll -------------------------------------------------------

/**
 * Vermerkt eine einmalige Benachrichtigung. true = war neu und darf raus,
 * false = wurde schon verschickt.
 */
async function claimOnce(userId, key) {
  const [result] = await pool.query(
    'INSERT IGNORE INTO push_log (user_id, dedupe_key) VALUES (?, ?)',
    [userId, key.slice(0, 100)]
  );
  return result.affectedRows === 1;
}

async function pruneLog(days = 30) {
  await pool.query(
    'DELETE FROM push_log WHERE created_at < NOW() - INTERVAL ? DAY',
    [days]
  );
}

module.exports = {
  saveSubscription,
  deleteSubscription,
  deleteSubscriptionById,
  markDelivered,
  countSubscriptions,
  listTargets,
  listSubscribedUserIds,
  getSettings,
  saveSettings,
  listTeamUserIds,
  listPendingRequests,
  findUserName,
  findTeam,
  listEventIdsStartingBetween,
  claimOnce,
  pruneLog,
};
