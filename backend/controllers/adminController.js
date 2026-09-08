// Verwaltungs-Controller (/api/admin/*).
//
// Kein SQL in dieser Datei – Datenzugriff über userRepository, Eingabe-Prüfung
// über utils/validation. Diese Datei enthält nur noch die Geschäftsregeln:
//   - Rolle & Freigabe ändern:            admin, sub_admin
//   - Spieler-Mannschaften & Dienste:     zusätzlich trainer
//   - sub_admin darf admin-Konten NICHT bearbeiten und NICHT zum admin machen
//   - niemand sperrt sich selbst aus; der letzte aktive admin bleibt erhalten
const userRepository = require('../repositories/userRepository');
const { validateUserPatch, parseId } = require('../utils/validation');
const { ADMIN_ROLES } = require('../utils/roles');

// GET /api/admin/users
async function listUsers(req, res, next) {
  try {
    const users = await userRepository.listAllWithProfiles();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/users/:id   Body: role?, isApproved?, teamIds?, services?
async function updateUser(req, res, next) {
  try {
    const userId = parseId(req.params.id);
    if (!userId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const actorRole = req.userRole;
    const canManageAccounts = ADMIN_ROLES.includes(actorRole);
    const isSubAdmin = actorRole === 'sub_admin';

    const { role, isApproved } = req.body || {};

    // Trainer:innen dürfen ausschliesslich Mannschaften/Dienste ändern.
    if (!canManageAccounts && (role !== undefined || isApproved !== undefined)) {
      return res
        .status(403)
        .json({ message: 'Nur Admins dürfen Rolle oder Freigabe ändern.' });
    }

    const patch = await validateUserPatch(req.body);
    if (!patch.ok) {
      return res.status(patch.status).json({ message: patch.message });
    }

    // sub_admin darf die Rolle "admin" nicht vergeben.
    if (isSubAdmin && patch.raw.role === 'admin') {
      return res.status(403).json({
        message:
          'Sub-Admins dürfen die Rolle „Admin“ nicht vergeben. Bitte einen Admin beauftragen.',
      });
    }

    const target = await userRepository.findById(userId);
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    // sub_admin darf admin-Konten überhaupt nicht anfassen.
    if (isSubAdmin && target.role === 'admin') {
      return res
        .status(403)
        .json({ message: 'Sub-Admins dürfen Admin-Konten nicht bearbeiten.' });
    }

    // Selbst-Aussperrung verhindern.
    const isSelf = userId === req.userId;
    if (isSelf && patch.raw.role !== undefined && patch.raw.role !== target.role) {
      return res.status(400).json({
        message:
          'Die eigene Rolle kann nicht geändert werden. Bitte von einem anderen Admin ändern lassen.',
      });
    }
    if (isSelf && patch.raw.isApproved === false) {
      return res
        .status(400)
        .json({ message: 'Die eigene Freigabe kann nicht entzogen werden.' });
    }

    // Es muss immer mindestens ein aktiver Admin übrig bleiben.
    const losesAdmin =
      (patch.raw.role !== undefined && patch.raw.role !== 'admin') ||
      patch.raw.isApproved === false;
    if (losesAdmin && target.role === 'admin') {
      const activeAdmins = await userRepository.countActiveAdmins();
      if (activeAdmins <= 1) {
        return res.status(409).json({
          message:
            'Der letzte aktive Admin kann nicht herabgestuft oder gesperrt werden.',
        });
      }
    }

    await userRepository.applyAdminChange(userId, {
      accountFields: patch.accountFields,
      playerTeamIds: patch.playerTeamIds,
      services: patch.services,
    });

    return res.json({ message: 'Benutzer aktualisiert.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, updateUser };
