const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  register,
  login,
  logout,
  me,
  completeOnboarding,
  updatePreferences,
  setProfilePhoto,
  deleteProfilePhoto,
  changePassword,
} = require('../controllers/authController');
const { authenticate, forbidWhileActingAs } = require('../middleware/authMiddleware');
const { uploadUserPhoto } = require('../config/uploads');

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

// Profilbilder landen auf der Platte – dieselbe Überlegung wie beim
// Mannschaftsfoto: Ein durchgedrehtes Skript oder ein übernommenes Konto soll
// sie nicht vollschreiben können.
const photoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Zu viele Bild-Uploads. Bitte in einigen Minuten erneut versuchen.',
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
// Zusätzlich je Konto: Wer über viele IPs (Botnetz, Mobilfunk) dasselbe Konto
// angreift, kommt am IP-Limit vorbei – an diesem nicht. Nur Fehlversuche zählen.
const accountLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    typeof req.body?.email === 'string' ? `login:${req.body.email.trim().toLowerCase().slice(0, 255)}` : 'login:-',
  message: {
    message: 'Zu viele Fehlversuche für dieses Konto. Bitte in einer Stunde erneut versuchen oder einen Admin bitten, das Passwort neu zu setzen.',
  },
});

router.post('/login', loginLimiter, accountLoginLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

// Eigenes Konto: jede Rolle darf das eigene Design, die eigene
// Mannschaftswahl und das eigene Passwort ändern.
//
// authenticate liest Sperre und Sitzungsgrenze bei jeder Anfrage frisch – ein
// zwischenzeitlich gesperrtes Konto kommt mit seinem alten Cookie nicht weiter.
const requireActiveAccount = [authenticate];

router.post('/me/onboarding', requireActiveAccount, completeOnboarding);
router.patch('/me/preferences', requireActiveAccount, updatePreferences);
// Das Passwort ändert nur, wer selbst angemeldet ist – nie Eltern im Kinderkonto.
router.post('/me/password', passwordLimiter, requireActiveAccount, forbidWhileActingAs, changePassword);

// Reihenfolge wie bei den Mannschaftsfotos: erst bremsen, dann anmelden, DANN
// erst die Datei entgegennehmen – so landet eine abgelehnte Anfrage gar nicht
// erst auf der Platte.
router.post(
  '/me/photo',
  photoLimiter,
  requireActiveAccount,
  uploadUserPhoto,
  setProfilePhoto
);
router.delete('/me/photo', requireActiveAccount, deleteProfilePhoto);

module.exports = router;
