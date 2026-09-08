// Verwaltungs-Controller.
//  - Rolle & Freigabe ändern: `admin` und `sub_admin`
//  - Mannschaftszuordnung ändern: zusätzlich `trainer`
// (Routen-Guard: checkRole(MANAGEMENT_ROLES) in routes/adminRoutes.js)
//
// Sub-Admins (Orga/Vorstand) dürfen Super-Admin-Konten weder bearbeiten noch
// jemanden zum Admin befördern.
const pool = require('../config/db');
const { normalizeTeamIds, replaceUserTeams } = require('../utils/teams');
const { normalizeServices, replaceUserServices } = require('../utils/services');
const { ROLES, ADMIN_ROLES } = require('../utils/roles');

// GET /api/admin/users – Liste aller Nutzer inkl. Mannschaften und Diensten.
async function listUsers(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, is_approved, role, created_at
         FROM users
        ORDER BY created_at DESC`
    );

    // Alle Mitgliedschaften und Dienste in je einem Rutsch laden.
    const [memberships] = await pool.query(
      `SELECT ut.user_id, ut.relation_type, t.id, t.code, t.name
         FROM user_teams ut
         JOIN teams t ON t.id = ut.team_id
        ORDER BY t.id`
    );
    const [services] = await pool.query(
      'SELECT user_id, service_type FROM user_services ORDER BY service_type'
    );

    const teamsByUser = new Map();
    for (const m of memberships) {
      if (!teamsByUser.has(m.user_id)) teamsByUser.set(m.user_id, []);
      teamsByUser.get(m.user_id).push({
        id: m.id,
        code: m.code,
        name: m.name,
        relationType: m.relation_type,
      });
    }

    const servicesByUser = new Map();
    for (const s of services) {
      if (!servicesByUser.has(s.user_id)) servicesByUser.set(s.user_id, []);
      servicesByUser.get(s.user_id).push(s.service_type);
    }

    const users = rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      isApproved: Boolean(row.is_approved),
      role: row.role,
      teams: teamsByUser.get(row.id) ?? [],
      services: servicesByUser.get(row.id) ?? [],
      createdAt: row.created_at,
    }));

    return res.json({ users });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/users/:id
// Body: role?, isApproved?, teamIds? (Spieler-Zuordnung), services?
async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const { role, isApproved, teamIds, services } = req.body || {};
    const actorRole = req.userRole;
    const canManageAccounts = ADMIN_ROLES.includes(actorRole);
    const isSubAdmin = actorRole === 'sub_admin';

    // Trainer dürfen ausschließlich die Mannschaftszuordnung ändern.
    if (!canManageAccounts && (role !== undefined || isApproved !== undefined)) {
      return res.status(403).json({
        message: 'Nur Admins dürfen Rolle oder Freigabe ändern.',
      });
    }

    // --- Eingaben validieren ---------------------------------------------
    const userUpdates = [];
    const userValues = [];

    if (role !== undefined) {
      if (!ROLES.includes(role)) {
        return res.status(400).json({ message: 'Ungültige Rolle.' });
      }
      // Sub-Admins dürfen niemanden zum Super-Admin machen.
      if (isSubAdmin && role === 'admin') {
        return res.status(403).json({
          message:
            'Sub-Admins dürfen die Rolle „Admin“ nicht vergeben. Bitte einen Admin beauftragen.',
        });
      }
      userUpdates.push('role = ?');
      userValues.push(role);
    }

    if (isApproved !== undefined) {
      if (typeof isApproved !== 'boolean') {
        return res
          .status(400)
          .json({ message: 'isApproved muss true oder false sein.' });
      }
      userUpdates.push('is_approved = ?');
      userValues.push(isApproved ? 1 : 0);
    }

    const teamCheck = await normalizeTeamIds(teamIds);
    if (!teamCheck.ok) {
      return res.status(400).json({ message: teamCheck.message });
    }
    const teamIdsToSet = teamCheck.ids; // undefined => nicht ändern

    const serviceCheck = normalizeServices(services);
    if (!serviceCheck.ok) {
      return res.status(400).json({ message: serviceCheck.message });
    }
    const servicesToSet = serviceCheck.services; // undefined => nicht ändern

    if (
      userUpdates.length === 0 &&
      teamIdsToSet === undefined &&
      servicesToSet === undefined
    ) {
      return res.status(400).json({
        message:
          'Keine Änderungen übergeben (role, isApproved, teamIds oder services).',
      });
    }

    // --- Zielnutzer laden -------------------------------------------------
    const [[target]] = await pool.query(
      'SELECT id, role FROM users WHERE id = ?',
      [userId]
    );
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    // Sub-Admins dürfen Super-Admin-Konten überhaupt nicht anfassen.
    if (isSubAdmin && target.role === 'admin') {
      return res
        .status(403)
        .json({ message: 'Sub-Admins dürfen Admin-Konten nicht bearbeiten.' });
    }

    // --- Schutzregeln -----------------------------------------------------
    const isSelf = userId === req.userId;

    if (isSelf && role !== undefined && role !== target.role) {
      return res.status(400).json({
        message:
          'Die eigene Rolle kann nicht geändert werden. Bitte von einem anderen Admin ändern lassen.',
      });
    }
    if (isSelf && isApproved === false) {
      return res
        .status(400)
        .json({ message: 'Die eigene Freigabe kann nicht entzogen werden.' });
    }

    // Schutz vor "kein Admin mehr übrig".
    const losesAdmin =
      (role !== undefined && role !== 'admin') || isApproved === false;
    if (losesAdmin && target.role === 'admin') {
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

    // --- Änderungen in einer Transaktion anwenden -------------------------
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (userUpdates.length > 0) {
        await conn.query(
          `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
          [...userValues, userId]
        );
      }

      // teamIds steuert bewusst nur die Spieler-Zuordnung; Trainer- und
      // Fan-Beziehungen werden auf der Mannschaftsseite gepflegt.
      if (teamIdsToSet !== undefined) {
        await replaceUserTeams(conn, userId, teamIdsToSet, 'player');
      }

      if (servicesToSet !== undefined) {
        await replaceUserServices(conn, userId, servicesToSet);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return res.json({ message: 'Benutzer aktualisiert.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, updateUser };
