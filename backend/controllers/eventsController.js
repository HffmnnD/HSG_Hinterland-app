// Termin-Controller (/api/events/*).
//
// Kein SQL in dieser Datei – Datenzugriff über eventRepository,
// Rechteprüfung über services/teamAccess, Aufbereitung über
// services/scheduleService.
//
//   GET    /api/events?teamId=&from=&to=   Termine im Zeitraum (+ eigener Status)
//   GET    /api/events/series?teamId=      Trainingsserien der Mannschaft
//   DELETE /api/events/series/:id          Serie als Ganzes beenden
//   GET    /api/events/:id                 ein Termin mit voller Kaderliste
//   POST   /api/events                     Einzeltermin ODER ganze Serie anlegen
//   PUT    /api/events/:id?scope=          Termin ändern (single | series)
//   DELETE /api/events/:id?scope=          Termin/Serie entfernen
const eventRepository = require('../repositories/eventRepository');
const teamAccess = require('../services/teamAccess');
const scheduleService = require('../services/scheduleService');
const { parseId } = require('../utils/validation');
const {
  validateEventCreate,
  validateEventUpdate,
  validateScope,
  validateRange,
} = require('../utils/scheduleValidation');
const { nowSqlDateTime, todaySqlDate, wallClockMs, toSqlDate } =
  require('../utils/schedule');

// Standardfenster der Terminliste, wenn der Client keinen Zeitraum angibt:
// von heute bis in vier Monate. Deckt eine Hin- oder Rückrunde ab, ohne die
// komplette Historie mitzuladen.
const DEFAULT_RANGE_DAYS = 120;

/** `YYYY-MM-DD` um n Tage verschieben. */
function shiftDate(date, days) {
  return toSqlDate(wallClockMs(date, '00:00') + days * 86400000);
}

/**
 * Welche Mannschaften sind gemeint? Ohne `teamId` alle, zu denen die Person
 * gehört – so ist der Reiter „Termine" ohne Vorauswahl sofort gefüllt.
 *
 * @returns {{ ok:true, teams:object[], selected:object[] }
 *          | { ok:false, status, message }}
 */
async function resolveTeams(viewer, teamIdParam) {
  const teams = await teamAccess.listAccessibleTeams(viewer);

  if (teamIdParam === undefined) {
    return { ok: true, teams, selected: teams };
  }

  const teamId = parseId(teamIdParam);
  if (!teamId) {
    return { ok: false, status: 400, message: 'Ungültige Mannschafts-ID.' };
  }

  const team = teams.find((entry) => entry.id === teamId);
  if (!team) {
    return { ok: false, status: 403, message: teamAccess.NOT_A_MEMBER };
  }
  return { ok: true, teams, selected: [team] };
}

// GET /api/events?teamId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
async function listEvents(req, res, next) {
  try {
    const viewer = { userId: req.userId, userRole: req.userRole };

    const range = validateRange(req.query);
    if (!range.ok) {
      return res.status(range.status).json({ message: range.message });
    }

    const resolved = await resolveTeams(viewer, req.query.teamId);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ message: resolved.message });
    }

    const from = range.from ?? todaySqlDate();
    const to = range.to ?? shiftDate(from, DEFAULT_RANGE_DAYS);

    const accessByTeam = new Map(
      resolved.selected.map((team) => [team.id, team])
    );
    const events = await eventRepository.listForTeams(
      resolved.selected.map((team) => team.id),
      `${from} 00:00:00`,
      `${to} 23:59:59`
    );

    const statusByEvent = await scheduleService.buildStatusByEvent(events);

    return res.json({
      range: { from, to },
      teams: resolved.teams,
      events: events.map((event) =>
        scheduleService.presentEventForList(
          event,
          statusByEvent.get(event.id) ?? [],
          { viewer, access: accessByTeam.get(event.teamId) ?? {} }
        )
      ),
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/events/series?teamId=X   (nur Verwaltung)
async function listSeries(req, res, next) {
  try {
    const teamId = parseId(req.query.teamId);
    if (!teamId) {
      return res.status(400).json({ message: 'Ungültige Mannschafts-ID.' });
    }

    const access = await teamAccess.requireManager(
      { userId: req.userId, userRole: req.userRole },
      teamId
    );
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const series = await eventRepository.listSeriesForTeam(
      teamId,
      nowSqlDateTime()
    );
    return res.json({ series });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/events/series/:id
//
// Beendet eine Serie als Ganzes – der Weg aus der Serienübersicht. Löscht
// alle noch nicht begonnenen Einheiten; vergangene bleiben in der Historie.
async function deleteSeries(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Serien-ID.' });
    }

    const series = await eventRepository.findSeriesById(id);
    if (!series) {
      return res.status(404).json({ message: 'Serie nicht gefunden.' });
    }

    const access = await teamAccess.requireManager(
      { userId: req.userId, userRole: req.userRole },
      series.teamId
    );
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const removed = await eventRepository.deleteSeries(id, nowSqlDateTime());
    return res.json({
      message: `Serie beendet – ${removed} künftige Termine entfernt. Vergangene Einheiten bleiben in der Historie.`,
      removed,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/events/:id
async function getEvent(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Termin-ID.' });
    }

    const event = await eventRepository.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Termin nicht gefunden.' });
    }

    const viewer = { userId: req.userId, userRole: req.userRole };
    const access = await teamAccess.requireMember(viewer, event.teamId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const statusByEvent = await scheduleService.buildStatusByEvent([event]);
    return res.json({
      event: scheduleService.presentEventForDetail(
        event,
        statusByEvent.get(event.id) ?? [],
        { viewer, access }
      ),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/events
//
// Body entweder mit `startTime`/`endTime` (Einzeltermin, auch mehrtägig) oder
// mit `recurrence` (Serie). Beides zusammen ist nicht vorgesehen – `recurrence`
// hätte sonst Vorrang, ohne dass es jemand merkt.
async function createEvent(req, res, next) {
  try {
    const input = validateEventCreate(req.body);
    if (!input.ok) {
      return res.status(input.status).json({ message: input.message });
    }

    const access = await teamAccess.requireManager(
      { userId: req.userId, userRole: req.userRole },
      input.teamId
    );
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    if (input.series) {
      const { seriesId, created } = await eventRepository.createSeriesWithEvents(
        {
          teamId: input.teamId,
          fields: input.fields,
          rule: input.series,
          occurrences: input.occurrences,
          createdBy: req.userId,
        }
      );
      return res.status(201).json({
        message: `Serie angelegt – ${created} Termine erzeugt.`,
        seriesId,
        created,
      });
    }

    const [occurrence] = input.occurrences;
    const eventId = await eventRepository.createEvent({
      teamId: input.teamId,
      fields: input.fields,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      createdBy: req.userId,
    });

    return res
      .status(201)
      .json({ message: 'Termin angelegt.', eventId, created: 1 });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/events/:id?scope=single|series
//
// `scope=series` ändert Titel, Ort, Art und Sichtbarkeit der ganzen Serie –
// aber nur für Termine, die noch nicht begonnen haben. Vergangene Einheiten
// sind Historie und werden nie rückwirkend umgeschrieben.
async function updateEvent(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Termin-ID.' });
    }

    const scopeCheck = validateScope(req.query.scope);
    if (!scopeCheck.ok) {
      return res.status(scopeCheck.status).json({ message: scopeCheck.message });
    }
    const { scope } = scopeCheck;

    const event = await eventRepository.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Termin nicht gefunden.' });
    }

    const access = await teamAccess.requireManager(
      { userId: req.userId, userRole: req.userRole },
      event.teamId
    );
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const input = validateEventUpdate(req.body, {
      scope,
      currentType: event.type,
    });
    if (!input.ok) {
      return res.status(input.status).json({ message: input.message });
    }

    if (scope === 'series') {
      if (!event.seriesId) {
        return res.status(400).json({
          message: 'Dieser Termin gehört zu keiner Serie.',
        });
      }
      const changed = await eventRepository.updateSeriesAndFutureEvents(
        event.seriesId,
        input.fields,
        nowSqlDateTime()
      );
      return res.json({
        message: `Serie geändert – ${changed} künftige Termine aktualisiert.`,
        changed,
      });
    }

    await eventRepository.updateEvent(id, {
      ...input.fields,
      start_time: input.times.startTime,
      end_time: input.times.endTime,
    });
    return res.json({ message: 'Termin gespeichert.', changed: 1 });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/events/:id?scope=single|series
async function deleteEvent(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Termin-ID.' });
    }

    const scopeCheck = validateScope(req.query.scope);
    if (!scopeCheck.ok) {
      return res.status(scopeCheck.status).json({ message: scopeCheck.message });
    }

    const event = await eventRepository.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Termin nicht gefunden.' });
    }

    const access = await teamAccess.requireManager(
      { userId: req.userId, userRole: req.userRole },
      event.teamId
    );
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    if (scopeCheck.scope === 'series') {
      if (!event.seriesId) {
        return res
          .status(400)
          .json({ message: 'Dieser Termin gehört zu keiner Serie.' });
      }
      const removed = await eventRepository.deleteSeries(
        event.seriesId,
        nowSqlDateTime()
      );
      return res.json({
        message: `Serie beendet – ${removed} künftige Termine entfernt. Vergangene Einheiten bleiben in der Historie.`,
        removed,
      });
    }

    await eventRepository.deleteEvent(id);
    return res.json({ message: 'Termin entfernt.', removed: 1 });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listEvents,
  listSeries,
  deleteSeries,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
};
