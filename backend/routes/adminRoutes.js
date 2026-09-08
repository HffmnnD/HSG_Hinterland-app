const express = require('express');

const { listUsers, updateUser } = require('../controllers/adminController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { MANAGEMENT_ROLES } = require('../utils/roles');

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

module.exports = router;
