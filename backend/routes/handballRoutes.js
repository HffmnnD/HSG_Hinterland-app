const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const {
  getTable,
  getSchedule,
  getTicker,
} = require('../controllers/handballController');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

// Schutz gegen Missbrauch als offener handball.net-Proxy.
//
// Gilt für Tabelle und Spielplan (Seitenwechsel). 90/Minute lässt mehreren
// offenen Tabs Luft und bremst trotzdem automatisierte Abfragen. Der Ticker
// hat unten ein eigenes, höheres Limit (2-Sekunden-Takt).
// Wichtig: greift NUR auf unser Backend – der Verband selbst sieht dank
// Cache und Anfrage-Bündelung höchstens einen Abruf pro Takt und Spiel.
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
const requireAuth = [authenticate];

router.get('/table/:teamId', handballLimiter, requireAuth, getTable);
router.get('/schedule/:teamId', handballLimiter, requireAuth, getSchedule);
// Ticker: eigenes Limit, weil ein laufendes Spiel im 2-Sekunden-Takt abgefragt
// wird (30/Minute je offenem Tab, plus Karte auf der Mannschaftsseite).
// Gezählt wird je KONTO statt je IP – sonst teilten sich alle Zuschauer im
// Hallen-WLAN (eine öffentliche IP) ein Limit. 150/Minute lässt mehrere Tabs
// und Geräte eines Kontos zu und bremst trotzdem jedes Skript.
// Deshalb steht `authenticate` hier VOR dem Limiter.
const tickerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number.parseInt(process.env.HANDBALL_TICKER_RATE_LIMIT, 10) || 150,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip)),
  message: {
    message: 'Zu viele Ticker-Anfragen. Bitte einen Moment warten.',
  },
});

router.get('/ticker/:gameId', requireAuth, tickerLimiter, getTicker);

// Wächter für laufende Spiele aller Mannschaften mit nuLiga-Code: hält das
// Backend während der Spielzeit beim nuScoreLive-Push angemeldet, damit die
// echten Uhrzeiten auch ohne Zuschauer:innen mitgeschrieben werden.
// Startet mit dem Laden dieser Routen (also mit dem Server).
require('../services/liveGameWatcher').start();

module.exports = router;
