const express = require('express');

const { listUsers, updateUser } = require('../controllers/adminController');
const { createNews, deleteNews } = require('../controllers/newsController');
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

router.get('/users', listUsers);
router.patch('/users/:id', updateUser);

// --- Vereins-News ----------------------------------------------------------
// Zusätzlich eingeschränkt: Trainer:innen dürfen keine Beiträge
// veröffentlichen oder löschen.
const requireAdmin = checkRole(ADMIN_ROLES);

router.post('/news', requireAdmin, uploadNewsImage, createNews);
router.delete('/news/:id', requireAdmin, deleteNews);

module.exports = router;
