// Anwesenheits-Controller (/api/attendances/*).
//
//   POST /api/attendances/respond   Zu-/Absage (mit Grund-Pflicht bei Absage)
//   GET  /api/attendances/history   Langzeit-Historie und Trainingsbeteiligung
//
// Kein SQL in dieser Datei.
const eventRepository = require('../repositories/eventRepository');
const attendanceRepository = require('../repositories/attendanceRepository');
const teamRepository = require('../repositories/teamRepository');
const userRepository = require('../repositories/userRepository');
const teamAccess = require('../services/teamAccess');
const scheduleService = require('../services/scheduleService');
const { applyReasonVisibility } = require('../services/attendanceService');
const { parseId } = require('../utils/validation');
const { validateRespond, validateRange } = require('../utils/scheduleValidation');
const {
  EVENT_TYPES,
  nowLocalIso,
  todaySqlDate,
  wallClockMs,
  toSqlDate,
} = require('../utils/schedule');

// Standard-Auswertungszeitraum der Historie: das letzte halbe Jahr.
const DEFAULT_HISTORY_DAYS = 180;

const NOT_IN_ROSTER =
  'Diese Person steht nicht im Kader der Mannschaft.';
const NOT_A_PLAYER =
  'Nur Spieler:innen dieser Mannschaft können sich zu- oder abmelden.';
const EVENT_OVER =
  'Der Termin ist vorbei. Eine nachträgliche Änderung kann nur der/die Trainer:in eintragen.';
const FOREIGN_HISTORY =
  'Du kannst nur deine eigene Historie einsehen.';

function shiftDate(date, days) {
  return toSqlDate(wallClockMs(date, '00:00') + days * 86400000);
}

// POST /api/attendances/respond
//   Body: { eventId, status, reason?, userId? }
//
// `userId` trägt der/die Trainer:in für jemand anderen ein („Manuelles
// Übersteuern"). Ohne `userId` meldet sich die anfragende Person selbst.
async function respond(req, res, next) {
  try {
    const input = validateRespond(req.body);
    if (!input.ok) {
      return res.status(input.status).json({ message: input.message });
    }

    const event = await eventRepository.findById(input.eventId);
    if (!event) {
      return res.status(404).json({ message: 'Termin nicht gefunden.' });
    }

    const viewer = { userId: req.userId, userRole: req.userRole };
    const access = await teamAccess.requireMember(viewer, event.teamId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const targetId = input.userId ?? req.userId;
    const forSomeoneElse = targetId !== req.userId;

    if (forSomeoneElse && !access.canManage) {
      return res.status(403).json({
        message:
          'Nur Trainer:innen dürfen die Anwesenheit anderer Spieler:innen eintragen.',
      });
    }

    // Auch für sich selbst gilt: nur wer im Kader steht, gibt Rückmeldung.
    const inRoster = forSomeoneElse
      ? await teamRepository.hasConfirmedRelation(targetId, event.teamId, 'player')
      : access.isPlayer;
    if (!inRoster) {
      return res
        .status(400)
        .json({ message: forSomeoneElse ? NOT_IN_ROSTER : NOT_A_PLAYER });
    }

    // Ein abgelaufener Termin lässt sich nicht mehr selbst „umsagen" – sonst
    // ließe sich die eigene Beteiligungsquote nachträglich schönen. Der/die
    // Trainer:in darf korrigieren, genau dafür ist die Übersteuerung da.
    if (!access.canManage && event.endTime < nowLocalIso()) {
      return res.status(409).json({ message: EVENT_OVER });
    }

    await attendanceRepository.upsert({
      eventId: event.id,
      userId: targetId,
      status: input.status,
      reason: input.reason,
      setByUserId: req.userId,
    });

    // Gültigen Status zurückgeben: Eine dauerhafte Abwesenheit kann die soeben
    // gespeicherte Angabe überlagern – die Oberfläche soll anzeigen, was
    // wirklich gilt.
    const statusByEvent = await scheduleService.buildStatusByEvent([event]);
    const entry =
      (statusByEvent.get(event.id) ?? []).find(
        (row) => row.userId === targetId
      ) ?? null;

    return res.json({
      message:
        input.status === 'DECLINED' ? 'Abmeldung gespeichert.' : 'Zusage gespeichert.',
      attendance: entry,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/attendances/history?teamId=X&userId=Y&from=&to=&type=
//
// Beantwortet zwei Fragen mit derselben Abfrage:
//   „War Person X am 01.01.2026 beim Training?"  -> entries
//   „Wie ist die Trainingsbeteiligung im Kader?" -> players
async function history(req, res, next) {
  try {
    const teamId = parseId(req.query.teamId);
    if (!teamId) {
      return res.status(400).json({ message: 'Ungültige Mannschafts-ID.' });
    }

    const range = validateRange(req.query);
    if (!range.ok) {
      return res.status(range.status).json({ message: range.message });
    }

    const type = req.query.type;
    if (type !== undefined && !EVENT_TYPES.includes(type)) {
      return res
        .status(400)
        .json({ message: `Ungültige Terminart. Erlaubt: ${EVENT_TYPES.join(', ')}.` });
    }

    const viewer = { userId: req.userId, userRole: req.userRole };
    const access = await teamAccess.requireMember(viewer, teamId);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    // Ohne Verwaltungsrechte gibt es ausschließlich die eigene Historie –
    // die Beteiligungsquote der Mitspieler:innen geht niemanden sonst an.
    const requestedUserId =
      req.query.userId === undefined ? null : parseId(req.query.userId);
    if (req.query.userId !== undefined && !requestedUserId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }
    if (
      !access.canManage &&
      requestedUserId !== null &&
      requestedUserId !== req.userId
    ) {
      return res.status(403).json({ message: FOREIGN_HISTORY });
    }
    const focusUserId = access.canManage
      ? requestedUserId
      : requestedUserId ?? req.userId;

    const to = range.to ?? todaySqlDate();
    const from = range.from ?? shiftDate(to, -DEFAULT_HISTORY_DAYS);

    const allEvents = await eventRepository.listForTeams(
      [teamId],
      `${from} 00:00:00`,
      `${to} 23:59:59`
    );
    const events = type
      ? allEvents.filter((event) => event.type === type)
      : allEvents;

    const statusByEvent = await scheduleService.buildStatusByEvent(events);
    const now = nowLocalIso();

    // Nur begonnene Termine zählen in die Quote: Ein Training in drei Wochen
    // ist noch keine Teilnahme, sonst wäre jede Statistik geschönt.
    const countedEvents = events.filter((event) => event.startTime <= now);

    const tally = new Map();
    for (const event of countedEvents) {
      for (const entry of statusByEvent.get(event.id) ?? []) {
        const player = tally.get(entry.userId) ?? {
          userId: entry.userId,
          firstName: entry.firstName,
          lastName: entry.lastName,
          jerseyNumber: entry.jerseyNumber,
          total: 0,
          attending: 0,
          declined: 0,
        };
        player.total += 1;
        if (entry.status === 'DECLINED') player.declined += 1;
        else player.attending += 1;
        tally.set(entry.userId, player);
      }
    }

    const players = [...tally.values()]
      .map((player) => ({
        ...player,
        // Anteil der Termine, bei denen die Person zugesagt war (0-100).
        rate:
          player.total === 0
            ? null
            : Math.round((player.attending / player.total) * 100),
      }))
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'de') ||
          a.firstName.localeCompare(b.firstName, 'de')
      );

    const response = {
      range: { from, to },
      team: {
        id: access.team.id,
        code: access.team.code,
        name: access.team.name,
      },
      canManage: access.canManage,
      type: type ?? null,
      totalEvents: events.length,
      countedEvents: countedEvents.length,
      // Die Kaderübersicht sieht nur, wer die Mannschaft verwaltet.
      players: access.canManage ? players : [],
    };

    // Einzelne Person im Fokus -> Termin für Termin auflisten.
    if (focusUserId !== null) {
      const rows = [];
      for (const event of events) {
        const entry = (statusByEvent.get(event.id) ?? []).find(
          (row) => row.userId === focusUserId
        );
        if (!entry) continue;

        const [visible] = applyReasonVisibility([entry], {
          canSeeReasons:
            access.canManage ||
            event.reasonsVisibleToAll ||
            focusUserId === req.userId,
          viewerId: req.userId,
        });

        rows.push({
          eventId: event.id,
          title: event.title,
          type: event.type,
          location: event.location,
          startTime: event.startTime,
          endTime: event.endTime,
          isPast: event.startTime <= now,
          status: visible.status,
          reason: visible.reason,
          reasonHidden: Boolean(visible.reasonHidden),
          source: visible.source,
          absenceType: visible.absenceType,
        });
      }

      // Namen bevorzugt aus dem Kader; wer im Zeitraum keinen einzigen Termin
      // hatte, steht dort nicht – dann aus dem Konto nachschlagen.
      const stats = tally.get(focusUserId) ?? null;
      const profile = stats ? null : await userRepository.findById(focusUserId);

      response.user = {
        id: focusUserId,
        firstName: stats?.firstName ?? profile?.first_name ?? null,
        lastName: stats?.lastName ?? profile?.last_name ?? null,
        jerseyNumber: stats?.jerseyNumber ?? null,
        total: stats?.total ?? 0,
        attending: stats?.attending ?? 0,
        declined: stats?.declined ?? 0,
        rate:
          stats && stats.total > 0
            ? Math.round((stats.attending / stats.total) * 100)
            : null,
      };
      response.entries = rows;
    }

    return res.json(response);
  } catch (err) {
    return next(err);
  }
}

module.exports = { respond, history };
