const express = require('express');

const { listNews } = require('../controllers/newsController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Lesen dürfen alle angemeldeten Mitglieder – Vereins-News sind interne
// Informationen und deshalb bewusst NICHT öffentlich.
// Das Anlegen und Löschen liegt unter /api/admin/news (siehe adminRoutes.js).
router.get('/', authenticate, checkRole(ROLES), listNews);

module.exports = router;
