// Admin-Controller: nur für die Rolle `admin` (siehe routes/adminRoutes.js).
const pool = require('../config/db');

const ALLOWED_ROLES = ['admin', 'trainer', 'spieler', 'zuschauer'];

// GET /api/admin/users – Liste aller Nutzer (für Freigabe & Rollenpflege).
async function listUsers(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, is_approved, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    const users = rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      isApproved: Boolean(row.is_approved),
      role: row.role,
      createdAt: row.created_at,
    }));

    return res.json({ users });
  } catch (err) {
    console.error('Fehler beim Laden der Nutzerliste:', err);
    return res.status(500).json({ message: 'Interner Serverfehler.' });
  }
}

// PATCH /api/admin/users/:id – Rolle und/oder Freigabestatus ändern.
async function updateUser(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const { role, isApproved } = req.body || {};
    const updates = [];
    const values = [];

    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ message: 'Ungültige Rolle.' });
      }
      updates.push('role = ?');
      values.push(role);
    }

    if (isApproved !== undefined) {
      updates.push('is_approved = ?');
      values.push(isApproved ? 1 : 0);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'Keine Änderungen übergeben (role oder isApproved).' });
    }

    values.push(userId);
    const [result] = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    return res.json({ message: 'Benutzer aktualisiert.' });
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Nutzers:', err);
    return res.status(500).json({ message: 'Interner Serverfehler.' });
  }
}

module.exports = { listUsers, updateUser };
