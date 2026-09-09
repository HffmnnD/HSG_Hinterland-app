const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  getTable,
  getSchedule,
  getTicker,
} = require('../controllers/handballController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Schutz gegen Missbrauch als offener handball.net-Proxy.
//
// Rechnung: Der Live-Ticker fragt alle 10 s -> 6 Requests/Minute pro Gerät.
// Dazu Tabelle und Spielplan beim Seitenwechsel. 90/Minute lässt auch
// mehreren offenen Tabs Luft und bremst trotzdem automatisierte Abfragen.
// Wichtig: greift NUR auf unser Backend – der Verband selbst sieht dank
// Cache ohnehin höchstens einen Request alle 10 s pro Spiel.
const handballLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Zu viele Anfragen. Bitte einen Moment warten.',
  },
});

// Angemeldete Mitglieder. Die Daten selbst sind zwar öffentlich, aber ein
// ungeschützter Endpunkt wäre ein fremdnutzbarer Proxy auf Kosten unserer
// IP-Reputation beim Verband. Soll der Spielplan später öffentlich werden
// (z. B. für eine Landingpage), genügt es, `requireAuth` hier zu entfernen.
const requireAuth = [authenticate, checkRole(ROLES)];

router.get('/table/:teamId', handballLimiter, requireAuth, getTable);
router.get('/schedule/:teamId', handballLimiter, requireAuth, getSchedule);
router.get('/ticker/:gameId', handballLimiter, requireAuth, getTicker);

module.exports = router;
