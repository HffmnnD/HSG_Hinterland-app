const express = require('express');
const rateLimit = require('express-rate-limit');

const { register, login, logout, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

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

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;
