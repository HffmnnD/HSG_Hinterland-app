const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  register,
  login,
  logout,
  me,
  setTheme,
  completeOnboarding,
  updatePreferences,
  changePassword,
} = require('../controllers/authController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Bremst Brute-Force- und Credential-Stuffing-Versuche aus.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  limit: 10, // pro IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // nur Fehlversuche zählen
  message: {
    message:
      'Zu viele Anmeldeversuche. Bitte versuche es in 15 Minuten erneut.',
  },
});

// Verhindert das massenhafte Anlegen von Konten.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 Stunde
  limit: 5, // pro IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message:
      'Zu viele Registrierungen von dieser Adresse. Bitte versuche es später erneut.',
  },
});

// Der Passwortwechsel prüft das aktuelle Passwort – also ebenfalls ein Ziel für
// Rateraten, nur hinter einer gültigen Sitzung. Nur Fehlversuche zählen, damit
// niemand ausgebremst wird, der sein Passwort zweimal am Tag ändert.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: 'Zu viele Versuche. Bitte versuche es in 15 Minuten erneut.',
  },
});

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

// Eigenes Konto: jede Rolle darf das eigene Design, die eigene
// Mannschaftswahl und das eigene Passwort ändern.
//
// `checkRole(ROLES)` steht hier nicht wegen der Rolle, sondern weil es Rolle
// UND Freigabe frisch aus der Datenbank liest: `authenticate` prüft nur das
// Token, das sieben Tage gilt. Ohne diese Zeile könnte ein zwischenzeitlich
// gesperrtes Konto mit seinem alten Cookie weiter Mannschaften beitreten.
const requireActiveAccount = [authenticate, checkRole(ROLES)];

router.patch('/me/theme', requireActiveAccount, setTheme);
router.post('/me/onboarding', requireActiveAccount, completeOnboarding);
router.patch('/me/preferences', requireActiveAccount, updatePreferences);
router.post('/me/password', passwordLimiter, requireActiveAccount, changePassword);

module.exports = router;
