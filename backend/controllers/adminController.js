// Admin-Controller: nur für die Rolle `admin` (siehe routes/adminRoutes.js).
const pool = require('../config/db');

const ALLOWED_ROLES = ['admin', 'trainer', 'spieler', 'zuschauer'];

// GET /api/admin/users – Liste aller Nutzer (für Freigabe & Rollenpflege).
async function listUsers(req, res, next) {
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
    return next(err);
  }
}

// PATCH /api/admin/users/:id – Rolle und/oder Freigabestatus ändern.
async function updateUser(req, res, next) {
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
      if (typeof isApproved !== 'boolean') {
        return res
          .status(400)
          .json({ message: 'isApproved muss true oder false sein.' });
      }
      updates.push('is_approved = ?');
      values.push(isApproved ? 1 : 0);
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ message: 'Keine Änderungen übergeben (role oder isApproved).' });
    }

    // Schutz vor Selbst-Aussperrung: die eigene Rolle bzw. Freigabe darf nicht
    // über diesen Endpunkt entzogen werden. (Die UI verbirgt das bereits,
    // die API muss es aber ebenfalls durchsetzen.)
    const isSelf = userId === req.userId;
    if (isSelf && role !== undefined && role !== 'admin') {
      return res.status(400).json({
        message:
          'Die eigene Admin-Rolle kann nicht entzogen werden. Bitte von einem anderen Admin ändern lassen.',
      });
    }
    if (isSelf && isApproved === false) {
      return res
        .status(400)
        .json({ message: 'Die eigene Freigabe kann nicht entzogen werden.' });
    }

    // Schutz vor "kein Admin mehr übrig": wenn dieser Nutzer der letzte Admin
    // ist, darf ihm weder die Rolle noch die Freigabe entzogen werden.
    const losesAdmin =
      (role !== undefined && role !== 'admin') || isApproved === false;

    if (losesAdmin) {
      const [[target]] = await pool.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );
      if (!target) {
        return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
      }

      if (target.role === 'admin') {
        const [[{ adminCount }]] = await pool.query(
          "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'admin' AND is_approved = 1"
        );
        if (adminCount <= 1) {
          return res.status(409).json({
            message:
              'Der letzte aktive Admin kann nicht herabgestuft oder gesperrt werden.',
          });
        }
      }
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
    return next(err);
  }
}

module.exports = { listUsers, updateUser };
