const express = require('express');

const {
  listUsers,
  getUserStats,
  updateUser,
  listTeams,
  createTeam,
} = require('../controllers/adminController');
const {
  listNewsForAdmin,
  createNews,
  archiveNews,
  deleteNews,
} = require('../controllers/newsController');
const {
  getSystemStatus,
  resetMetrics,
  clearHandballCache,
} = require('../controllers/systemController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { uploadNewsImage } = require('../config/uploads');
const { MANAGEMENT_ROLES, ADMIN_ROLES } = require('../utils/roles');

const router = express.Router();

// Login prüfen; Zugriff für `admin`, `sub_admin` und `trainer`.
// Feinere Rechte setzt der Controller durch:
//   - Rolle/Freigabe: nur admin & sub_admin
//   - Sub-Admins dürfen keine Admin-Konten bearbeiten und niemanden zum
//     Admin befördern
//   - Trainer: nur Mannschaftszuordnung
router.use(authenticate, checkRole(MANAGEMENT_ROLES));

// Alles, was über die Mitgliederzuordnung hinausgeht, bleibt admin/sub_admin
// vorbehalten – Trainer:innen sehen die entsprechenden Bereiche gar nicht erst.
const requireAdmin = checkRole(ADMIN_ROLES);

// --- Mitglieder -------------------------------------------------------------
// Seitenweise, mit Suche und Filtern (?search=&role=&status=&page=&pageSize=).
router.get('/users', listUsers);
router.get('/users/stats', getUserStats);
router.patch('/users/:id', updateUser);

// --- Vereins-News ----------------------------------------------------------
// Zusätzlich eingeschränkt: Trainer:innen dürfen keine Beiträge
// veröffentlichen, archivieren oder löschen.
router.get('/news', requireAdmin, listNewsForAdmin);
router.post('/news', requireAdmin, uploadNewsImage, createNews);
// Archivieren/Zurückholen ist der Regelweg; DELETE löscht endgültig samt Bild.
router.patch('/news/:id', requireAdmin, archiveNews);
router.delete('/news/:id', requireAdmin, deleteNews);

// --- Mannschaften -----------------------------------------------------------
// Anlegen und Stammdaten sind Admin-Sache: `handball_team_id` entscheidet,
// welche Ligadaten allen Mitgliedern angezeigt werden. Die Kaderpflege einer
// einzelnen Mannschaft liegt weiterhin unter /api/teams/:code.
router.get('/teams', requireAdmin, listTeams);
router.post('/teams', requireAdmin, createTeam);

// --- System-Status ----------------------------------------------------------
// Betriebsdaten (Hostname, Pfade, Auslastung) gehen nur an admin/sub_admin.
router.get('/system', requireAdmin, getSystemStatus);
router.post('/system/metrics/reset', requireAdmin, resetMetrics);
router.post('/system/handball-cache/clear', requireAdmin, clearHandballCache);

module.exports = router;
