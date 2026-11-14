// Kalender als iCal-Datei und als Abo (/api/calendar/*).
//
//   GET  /export.ics            Datei herunterladen (angemeldet)
//   GET  /subscription          Abo-Pfad, legt beim ersten Mal einen an
//   POST /subscription/renew    neuer Pfad, der alte gilt nicht mehr
//   GET  /feed/:token.ics       Abo für Kalender-Apps (ohne Login, Schlüssel in der Adresse)
//
// Inhalt wie im eigenen Kalender der App: Termine der Mannschaften, in denen
// man spielt oder trainiert, und die eigenen Dienste. Keine offenen Dienste.
const express = require('express');
const rateLimit = require('express-rate-limit');

const { authenticate } = require('../middleware/authMiddleware');
const { todaySqlDate, addMinutesToSql } = require('../utils/schedule');
const eventRepository = require('../repositories/eventRepository');
const teamAccess = require('../services/teamAccess');
const { viewerFor } = require('../access/service');
const repository = require('./repository');
const clubEvents = require('../clubEvents');
const { buildCalendar } = require('./ics');

const router = express.Router();
const requireAuth = [authenticate];

const PAST_DAYS = 60;
const FUTURE_DAYS = 400;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Kalender-Apps fragen höchstens stündlich. Wer die Adresse errät, braucht
// 2^256 Versuche, die Bremse hält trotzdem Dauerbeschuss vom Server fern.
const feedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Zu viele Abrufe.',
});

const perUser = (req) => `user:${req.userId}`;
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Abrufe. Bitte kurz warten.' },
});

const TYPE_LABEL = {
  REGULAR_TRAINING: 'Training',
  SINGLE_TRAINING: 'Training',
  MATCH: 'Spiel',
  EVENT_CAMP: 'Termin',
};

async function buildFor(user) {
  const today = todaySqlDate();
  const fromSql = addMinutesToSql(`${today} 00:00:00`, -PAST_DAYS * 1440);
  const toSql = addMinutesToSql(`${today} 23:59:59`, FUTURE_DAYS * 1440);

  const teams = (await teamAccess.listAccessibleTeams(await viewerFor(user.id))).filter(
    (team) => team.isMember
  );
  const [events, duties, clubDates] = await Promise.all([
    eventRepository.listForTeams(teams.map((team) => team.id), fromSql, toSql),
    repository.listOwnDuties(user.id, fromSql, toSql),
    // Vereinstermine: alle sichtbaren, außer denen, die man abgesagt hat.
    clubEvents.listVisible({ userId: user.id, seesAll: false }, fromSql, toSql),
  ]);

  const entries = [
    ...events.map((event) => ({
      uid: `event-${event.id}@hsg-hinterland`,
      start: event.startTime,
      end: event.endTime,
      title: event.title,
      location: event.location,
      description: [event.teamName, TYPE_LABEL[event.type], event.cancelReason].filter(Boolean).join(' · '),
      cancelled: Boolean(event.cancelledAt),
    })),
    ...duties.map((duty) => ({
      uid: `duty-${duty.id}@hsg-hinterland`,
      start: duty.startTime,
      end: duty.endTime,
      title: `Dienst: ${duty.title}`,
      location: duty.location,
      description: duty.planTitle,
    })),
    ...clubDates
      .filter((event) => event.myResponse?.status !== 'no')
      .map((event) => ({
        uid: `club-${event.id}@hsg-hinterland`,
        start: event.startTime,
        end: event.endTime,
        title: event.title,
        location: event.location,
        description: ['Vereinstermin', event.cancelReason, event.description].filter(Boolean).join(' · ').slice(0, 500),
        cancelled: Boolean(event.cancelledAt),
      })),
  ];
  return buildCalendar({ name: 'HSG Hinterland', entries });
}

function sendIcs(res, body, { download }) {
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'private, max-age=300');
  if (download) res.set('Content-Disposition', 'attachment; filename="hsg-hinterland.ics"');
  return res.send(body);
}

router.get('/export.ics', requireAuth, exportLimiter, async (req, res, next) => {
  try {
    return sendIcs(res, await buildFor({ id: req.userId, role: req.userRole }), { download: true });
  } catch (err) {
    return next(err);
  }
});

const feedPath = (token) => `/api/calendar/feed/${token}.ics`;

router.get('/subscription', requireAuth, async (req, res, next) => {
  try {
    const token = (await repository.getToken(req.userId)) ?? (await repository.renewToken(req.userId));
    return res.json({ path: feedPath(token) });
  } catch (err) {
    return next(err);
  }
});

router.post('/subscription/renew', requireAuth, exportLimiter, async (req, res, next) => {
  try {
    return res.json({ path: feedPath(await repository.renewToken(req.userId)), message: 'Neuer Link erstellt.' });
  } catch (err) {
    return next(err);
  }
});

router.get('/feed/:file', feedLimiter, async (req, res, next) => {
  try {
    const token = req.params.file.replace(/\.ics$/, '');
    if (!TOKEN_PATTERN.test(token)) return res.status(404).send('Nicht gefunden.');
    const user = await repository.findUserByToken(token);
    if (!user) return res.status(404).send('Nicht gefunden.');
    return sendIcs(res, await buildFor(user), { download: false });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
