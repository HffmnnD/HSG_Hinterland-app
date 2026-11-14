// Vereinstermine mit Teilnahme-Abfrage – eingebunden in server.js mit
//   require('./clubEvents').mount(app);
// Braucht Migration 032.
//
//   GET    /api/club-events?from=&to=     sichtbare Termine + eigene Antwort + Zählung
//   GET    /api/club-events/:id           ein Termin; mit Recht events.manage samt Namensliste
//   POST   /api/club-events               anlegen            (events.manage)
//   PUT    /api/club-events/:id           ändern             (events.manage)
//   POST   /api/club-events/:id/cancel    absagen / Absage zurücknehmen (events.manage)
//   DELETE /api/club-events/:id           löschen            (events.manage)
//   POST   /api/club-events/:id/respond   { status: yes|maybe|no, guests?, note? }
//
// Sichtbar: Termine „für alle" für jedes Mitglied, Termine für Mannschaften
// nur für deren Mitglieder (und die Planung). Eltern antworten im Konto des
// Kindes für das Kind.
const express = require('express');
const rateLimit = require('express-rate-limit');

const pool = require('../config/db');
const { authenticate, requirePermission, forbidWhileActingAs } = require('../middleware/authMiddleware');
const appEvents = require('../services/appEvents');
const { parseId } = require('../utils/validation');
const { nowLocalIso, todaySqlDate, addMinutesToSql } = require('../utils/schedule');

const router = express.Router();
router.use(authenticate);

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Änderungen. Bitte in einigen Minuten erneut versuchen.' },
});

const canManage = (req) => Boolean(req.access?.permissions?.has('events.manage'));
const manageOnly = [forbidWhileActingAs, requirePermission('events.manage'), writeLimiter];
const NOT_FOUND = { message: 'Termin nicht gefunden.' };
const STATUSES = ['yes', 'maybe', 'no'];
const MAX_GUESTS = 10;
// Ohne `to` reicht die Liste so weit voraus – Veranstaltungen stehen oft lange vorher fest.
const UPCOMING_DAYS = 3 * 365;

// ------------------------------------------------------------ Eingaben --

const DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/;

/** `YYYY-MM-DDTHH:MM` -> SQL-DATETIME in Ortszeit, sonst null. */
function readDateTime(value) {
  const match = DATETIME.exec(String(value ?? ''));
  if (!match) return null;
  const sql = `${match[1]} ${match[2]}:00`;
  return Number.isNaN(new Date(sql.replace(' ', 'T')).getTime()) ? null : sql;
}

const cleanText = (value, max) => {
  const text = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  return text ? text.slice(0, max) : null;
};

async function validate(body) {
  const title = cleanText(body?.title, 120);
  if (!title) return { ok: false, message: 'Bitte einen Titel angeben.' };

  const start = readDateTime(body?.startTime);
  const end = readDateTime(body?.endTime);
  if (!start || !end) return { ok: false, message: 'Bitte Beginn und Ende mit Datum und Uhrzeit angeben.' };
  if (end <= start) return { ok: false, message: 'Das Ende muss nach dem Beginn liegen.' };

  let deadline = null;
  if (body?.responseDeadline) {
    deadline = readDateTime(body.responseDeadline);
    if (!deadline) return { ok: false, message: 'Die Anmeldefrist ist kein gültiger Zeitpunkt.' };
    if (deadline > start) return { ok: false, message: 'Die Anmeldefrist muss vor dem Beginn liegen.' };
  }

  let max = null;
  if (body?.maxParticipants !== undefined && body.maxParticipants !== null && body.maxParticipants !== '') {
    max = Number(body.maxParticipants);
    if (!Number.isInteger(max) || max < 1 || max > 5000) {
      return { ok: false, message: 'Die Teilnehmergrenze muss zwischen 1 und 5000 liegen.' };
    }
  }

  const audience = body?.audience === 'teams' ? 'teams' : 'club';
  let teamIds = [];
  if (audience === 'teams') {
    teamIds = [...new Set((Array.isArray(body?.teamIds) ? body.teamIds : []).map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (teamIds.length === 0) return { ok: false, message: 'Bitte mindestens eine Mannschaft auswählen.' };
    const [rows] = await pool.query('SELECT id FROM teams WHERE id IN (?)', [teamIds]);
    if (rows.length !== teamIds.length) return { ok: false, message: 'Unbekannte Mannschaft in der Auswahl.' };
  }

  return {
    ok: true,
    teamIds,
    fields: {
      title,
      description: cleanText(body?.description, 4000),
      location: cleanText(body?.location, 150),
      start_time: start,
      end_time: end,
      audience,
      rsvp_enabled: body?.rsvpEnabled === false ? 0 : 1,
      response_deadline: deadline,
      allow_guests: body?.allowGuests ? 1 : 0,
      max_participants: max,
    },
  };
}

// ------------------------------------------------------------------ SQL --

const COLUMNS = `
  e.id, e.title, e.description, e.location, e.audience, e.rsvp_enabled,
  e.allow_guests, e.max_participants, e.cancel_reason,
  DATE_FORMAT(e.start_time, '%Y-%m-%dT%H:%i:%s') AS start_time,
  DATE_FORMAT(e.end_time, '%Y-%m-%dT%H:%i:%s') AS end_time,
  DATE_FORMAT(e.response_deadline, '%Y-%m-%dT%H:%i:%s') AS response_deadline,
  DATE_FORMAT(e.cancelled_at, '%Y-%m-%dT%H:%i:%s') AS cancelled_at`;

// Sichtbarkeit: für alle – oder die Person gehört (bestätigt) zu einer der Mannschaften.
const VISIBLE = `
  (e.audience = 'club' OR ? = 1 OR EXISTS (
     SELECT 1 FROM club_event_teams ct
       JOIN user_teams ut ON ut.team_id = ct.team_id
      WHERE ct.event_id = e.id AND ut.user_id = ? AND ut.is_confirmed = 1))`;

async function decorate(rows, userId) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [teams] = await pool.query(
    `SELECT ct.event_id, t.id, t.code, t.name FROM club_event_teams ct
       JOIN teams t ON t.id = ct.team_id WHERE ct.event_id IN (?) ORDER BY t.name`,
    [ids]
  );
  const [counts] = await pool.query(
    `SELECT event_id, status, COUNT(*) AS people, SUM(guests) AS guests
       FROM club_event_responses WHERE event_id IN (?) GROUP BY event_id, status`,
    [ids]
  );
  const [mine] = await pool.query(
    'SELECT event_id, status, guests, note FROM club_event_responses WHERE event_id IN (?) AND user_id = ?',
    [ids, userId]
  );
  const now = nowLocalIso();

  return rows.map((row) => {
    const summary = { yes: 0, maybe: 0, no: 0, guests: 0 };
    for (const count of counts.filter((c) => c.event_id === row.id)) {
      summary[count.status] = Number(count.people);
      if (count.status === 'yes') summary.guests = Number(count.guests) || 0;
    }
    const own = mine.find((m) => m.event_id === row.id);
    const closesAt = row.response_deadline ?? row.start_time;
    const taken = summary.yes + summary.guests;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      startTime: row.start_time,
      endTime: row.end_time,
      audience: row.audience,
      teams: teams.filter((t) => t.event_id === row.id).map((t) => ({ id: t.id, code: t.code, name: t.name })),
      rsvpEnabled: Boolean(row.rsvp_enabled),
      responseDeadline: row.response_deadline,
      allowGuests: Boolean(row.allow_guests),
      maxParticipants: row.max_participants,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      summary,
      spotsLeft: row.max_participants === null ? null : Math.max(0, row.max_participants - taken),
      // Antworten sind möglich, solange Frist und Beginn nicht vorbei sind.
      responseOpen: Boolean(row.rsvp_enabled) && !row.cancelled_at && closesAt > now,
      myResponse: own ? { status: own.status, guests: own.guests, note: own.note } : null,
    };
  });
}

/**
 * Sichtbare Vereinstermine im Zeitraum (auch für Kalender-Export und -Abo).
 * @param {{ userId:number, seesAll:boolean }} viewer
 */
async function listVisible(viewer, fromSql, toSql) {
  try {
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM club_events e
        WHERE e.end_time >= ? AND e.start_time <= ? AND ${VISIBLE}
        ORDER BY e.start_time, e.id LIMIT 500`,
      [fromSql, toSql, viewer.seesAll ? 1 : 0, viewer.userId]
    );
    return decorate(rows, viewer.userId);
  } catch (err) {
    // Ohne Migration 032 gibt es schlicht keine Vereinstermine.
    if (err.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function findVisible(req, id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM club_events e WHERE e.id = ? AND ${VISIBLE}`, [
    id, canManage(req) ? 1 : 0, req.userId,
  ]);
  return (await decorate(rows, req.userId))[0] ?? null;
}

async function saveTeams(conn, eventId, teamIds) {
  await conn.query('DELETE FROM club_event_teams WHERE event_id = ?', [eventId]);
  if (teamIds.length > 0) {
    await conn.query('INSERT INTO club_event_teams (event_id, team_id) VALUES ?', [teamIds.map((id) => [eventId, id])]);
  }
}

async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------- Routen --

router.get('/', async (req, res, next) => {
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = day.test(req.query.from ?? '') ? req.query.from : todaySqlDate();
    const to = day.test(req.query.to ?? '') ? req.query.to : addMinutesToSql(`${from} 00:00:00`, UPCOMING_DAYS * 1440).slice(0, 10);
    const events = await listVisible({ userId: req.userId, seesAll: canManage(req) }, `${from} 00:00:00`, `${to} 23:59:59`);
    return res.json({ events, canManage: canManage(req) && !req.actingAs });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const event = await findVisible(req, parseId(req.params.id));
    if (!event) return res.status(404).json(NOT_FOUND);
    const manage = canManage(req) && !req.actingAs;
    if (manage) {
      const [rows] = await pool.query(
        `SELECT r.user_id, r.status, r.guests, r.note, u.first_name, u.last_name
           FROM club_event_responses r JOIN users u ON u.id = r.user_id
          WHERE r.event_id = ? ORDER BY u.last_name, u.first_name`,
        [event.id]
      );
      event.responses = rows.map((row) => ({
        userId: row.user_id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        status: row.status,
        guests: row.guests,
        note: row.note,
      }));
    }
    return res.json({ event, canManage: manage });
  } catch (err) {
    return next(err);
  }
});

router.post('/', manageOnly, async (req, res, next) => {
  try {
    const input = await validate(req.body);
    if (!input.ok) return res.status(400).json({ message: input.message });
    const id = await inTransaction(async (conn) => {
      const [result] = await conn.query('INSERT INTO club_events SET ?', [{ ...input.fields, created_by: req.userId }]);
      await saveTeams(conn, result.insertId, input.teamIds);
      return result.insertId;
    });
    const event = await findVisible(req, id);
    appEvents.publish('clubEvent.created', { event, teamIds: input.teamIds, actorId: req.userId });
    return res.status(201).json({ message: 'Termin angelegt.', event });
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', manageOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await findVisible(req, id))) return res.status(404).json(NOT_FOUND);
    const input = await validate(req.body);
    if (!input.ok) return res.status(400).json({ message: input.message });
    await inTransaction(async (conn) => {
      await conn.query('UPDATE club_events SET ? WHERE id = ?', [input.fields, id]);
      await saveTeams(conn, id, input.teamIds);
    });
    return res.json({ message: 'Termin gespeichert.', event: await findVisible(req, id) });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/cancel', manageOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = await findVisible(req, id);
    if (!event) return res.status(404).json(NOT_FOUND);
    const cancelled = req.body?.cancelled !== false;
    await pool.query('UPDATE club_events SET cancelled_at = ?, cancel_reason = ? WHERE id = ?', [
      cancelled ? new Date() : null,
      cancelled ? cleanText(req.body?.reason, 200) : null,
      id,
    ]);
    const updated = await findVisible(req, id);
    if (cancelled) appEvents.publish('clubEvent.cancelled', { event: updated, actorId: req.userId });
    return res.json({ message: cancelled ? 'Termin abgesagt.' : 'Absage zurückgenommen.', event: updated });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', manageOnly, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM club_events WHERE id = ?', [parseId(req.params.id)]);
    if (result.affectedRows === 0) return res.status(404).json(NOT_FOUND);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/respond', writeLimiter, async (req, res, next) => {
  try {
    const event = await findVisible(req, parseId(req.params.id));
    if (!event) return res.status(404).json(NOT_FOUND);
    if (!event.rsvpEnabled) return res.status(400).json({ message: 'Für diesen Termin wird keine Rückmeldung abgefragt.' });
    if (event.cancelledAt) return res.status(409).json({ message: 'Dieser Termin wurde abgesagt.' });
    if (!event.responseOpen) return res.status(409).json({ message: 'Die Anmeldefrist ist abgelaufen.' });

    const status = req.body?.status;
    if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Bitte „dabei", „vielleicht" oder „nicht dabei" wählen.' });
    let guests = status === 'yes' && event.allowGuests ? Number(req.body?.guests ?? 0) : 0;
    if (!Number.isInteger(guests) || guests < 0 || guests > MAX_GUESTS) {
      return res.status(400).json({ message: `Begleitpersonen: 0 bis ${MAX_GUESTS}.` });
    }

    // Obergrenze: Plätze, die die Person schon belegt, zählen nicht doppelt.
    if (status === 'yes' && event.maxParticipants !== null) {
      const mine = event.myResponse?.status === 'yes' ? 1 + event.myResponse.guests : 0;
      if (1 + guests > event.spotsLeft + mine) {
        return res.status(409).json({
          message: event.spotsLeft + mine <= 0 ? 'Leider sind alle Plätze vergeben.' : `Es sind nur noch ${event.spotsLeft + mine} Plätze frei.`,
        });
      }
    }

    await pool.query(
      `INSERT INTO club_event_responses (event_id, user_id, status, guests, note, set_by) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), guests = VALUES(guests), note = VALUES(note), set_by = VALUES(set_by)`,
      [event.id, req.userId, status, guests, cleanText(req.body?.note, 200), req.actorId ?? req.userId]
    );
    return res.json({ message: 'Rückmeldung gespeichert.', event: await findVisible(req, event.id) });
  } catch (err) {
    return next(err);
  }
});

function mount(app) {
  app.use('/api/club-events', router);
}

module.exports = { mount, listVisible };
