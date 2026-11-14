const express = require('express');

const { listNews, getNewsFile } = require('../controllers/newsController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Lesen dürfen alle angemeldeten Mitglieder – Vereins-News sind interne
// Informationen und deshalb bewusst NICHT öffentlich.
// Das Anlegen und Löschen liegt unter /api/admin/news (siehe adminRoutes.js).
router.get('/', authenticate, listNews);
// Dokumente und Videos eines Beitrags – nur für alle, die ihn sehen dürfen.
router.get('/:id/files/:fileId', authenticate, getNewsFile);

module.exports = router;
