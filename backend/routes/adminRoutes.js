const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  listUsers,
  getUserStats,
  updateUser,
  resetUserPassword,
  listTeams,
  createTeam,
} = require('../controllers/adminController');
const {
  listNewsForAdmin,
  createNews,
  updateNews,
  archiveNews,
  deleteNews,
  addNewsFiles,
} = require('../controllers/newsController');
const newsExtras = require('../services/newsExtras');
const {
  getSystemStatus,
  resetMetrics,
  clearHandballCache,
} = require('../controllers/systemController');
const {
  authenticate,
  requirePermission,
  forbidWhileActingAs,
} = require('../middleware/authMiddleware');
const { uploadNewsImage } = require('../config/uploads');

const router = express.Router();

// Bremse für das Setzen fremder Passwörter – ein übernommenes Admin-Konto soll
// nicht in Sekunden alle Konten umstellen können.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => 'user:' + req.userId,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Passwort-Änderungen. Bitte kurz warten.' },
});

// Jede Funktion verlangt ihr eigenes Recht (access/permissions.js). Wer keines
// davon hat, kommt nicht in die Verwaltung. Eltern, die gerade als Kind
// handeln, verwalten nie etwas.
router.use(authenticate, forbidWhileActingAs);

const p = requirePermission;

// --- Mitglieder -------------------------------------------------------------
// Seitenweise, mit Suche und Filtern (?search=&role=&status=&teamId=&page=).
router.get('/users', p('members.view'), listUsers);
router.get('/users/stats', p('members.view'), getUserStats);
// Feinere Prüfung je Feld im Controller (Rolle, Sperre, Dienste, Mannschaften).
router.patch('/users/:id', p('members.view'), updateUser);
// Passwort-Notfall: nur Admins (Superuser) – Prüfung im Controller.
router.post('/users/:id/password', passwordLimiter, resetUserPassword);

// --- Vereins-News ----------------------------------------------------------
router.get('/news', p('news.manage'), listNewsForAdmin);
// Erst Recht prüfen, DANN die Datei annehmen – Abgelehntes landet nie auf der Platte.
router.post('/news', p('news.manage'), uploadNewsImage, createNews);
// Dokumente und Videos kommen in einem zweiten Schritt an den Beitrag.
router.post('/news/:id/files', p('news.manage'), newsExtras.files.receive, addNewsFiles);
// Archivieren/Zurückholen ist der Regelweg; DELETE löscht endgültig samt Bild.
router.patch('/news/:id', p('news.manage'), archiveNews);
router.put('/news/:id', p('news.manage'), uploadNewsImage, updateNews);
router.delete('/news/:id', p('news.manage'), deleteNews);

// --- Mannschaften -----------------------------------------------------------
// Anlegen und Stammdaten: die nuLiga-Nummer entscheidet, welche Ligadaten
// allen Mitgliedern angezeigt werden. Die Kaderpflege liegt unter /api/teams.
router.get('/teams', p('teams.create', 'teams.edit', 'teams.manage_all'), listTeams);
router.post('/teams', p('teams.create'), createTeam);

// --- System-Status ----------------------------------------------------------
router.get('/system', p('system.view'), getSystemStatus);
router.post('/system/metrics/reset', p('system.view'), resetMetrics);
router.post('/system/handball-cache/clear', p('system.view'), clearHandballCache);

module.exports = router;
