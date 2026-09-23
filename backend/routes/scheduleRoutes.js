// Routen des Termin-Moduls. Drei Router in einer Datei, weil sie dieselbe
// Rechtelogik teilen und zusammen EIN Thema sind:
//
//   /api/events      Termine und Trainingsserien
//   /api/attendances Zu-/Absagen und Historie
//   /api/absences    Urlaub und Verletzungen
//
// Alle Endpunkte setzen eine gültige Anmeldung voraus; wer welche Mannschaft
// sehen oder verwalten darf, prüfen die Controller über services/teamAccess.
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  listEvents,
  listSeries,
  deleteSeries,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} = require('../controllers/eventsController');
const {
  respond,
  history,
} = require('../controllers/attendanceController');
const {
  listLongTerm,
  createLongTerm,
  deleteLongTerm,
} = require('../controllers/absencesController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

// checkRole(ROLES) liest Rolle und Sperrstatus frisch aus der Datenbank –
// dieselbe Absicherung wie auf der Mannschaftsseite.
const requireAuth = [authenticate, checkRole(ROLES)];

// Eine Serie kann bis zu 400 Termine auf einmal anlegen. Das ist gewollt,
// aber nichts, was jemand im Sekundentakt braucht – deshalb eine Bremse auf
// die schreibenden Termin-Endpunkte.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Zu viele Änderungen. Bitte in einigen Minuten erneut versuchen.',
  },
});

// --- /api/events ------------------------------------------------------------

const eventsRouter = express.Router();

eventsRouter.get('/', requireAuth, listEvents);
// MUSS vor '/:id' stehen, sonst landet „series" als Termin-ID im Controller.
eventsRouter.get('/series', requireAuth, listSeries);
eventsRouter.get('/:id', requireAuth, getEvent);

// Ebenfalls vor '/:id': sonst wäre „series" die Termin-ID.
eventsRouter.delete('/series/:id', writeLimiter, requireAuth, deleteSeries);

eventsRouter.post('/', writeLimiter, requireAuth, createEvent);
eventsRouter.put('/:id', writeLimiter, requireAuth, updateEvent);
eventsRouter.delete('/:id', writeLimiter, requireAuth, deleteEvent);

// --- /api/attendances -------------------------------------------------------

const attendancesRouter = express.Router();

attendancesRouter.post('/respond', requireAuth, respond);
attendancesRouter.get('/history', requireAuth, history);

// --- /api/absences ----------------------------------------------------------

const absencesRouter = express.Router();

absencesRouter.get('/long-term', requireAuth, listLongTerm);
absencesRouter.post('/long-term', writeLimiter, requireAuth, createLongTerm);
absencesRouter.delete('/long-term/:id', requireAuth, deleteLongTerm);

module.exports = { eventsRouter, attendancesRouter, absencesRouter };
