// Spieler-Ansicht: GET /api/teams/:code/members/:userId/profile
//
// Alles Wichtige zu EINEM Mitglied einer Mannschaft auf einen Blick:
// Kaderangaben, Kontakt (nach denselben Regeln wie im Kader), feste
// Trainingszeiten, die nächsten Termine mit seiner Rückmeldung und die
// Trainingsbeteiligung der letzten 90 Tage.
//
// Sehen darf das, wer selbst zur Mannschaft gehört (Spieler:in oder
// Trainerteam) – wie den Kader. Kontaktdaten von Spieler:innen sieht nur das
// Trainerteam, die Person selbst und ihre Eltern.
const teamRepository = require('../repositories/teamRepository');
const eventRepository = require('../repositories/eventRepository');
const scheduleService = require('../services/scheduleService');
const teamAccess = require('../services/teamAccess');
const { viewerOf } = require('../access/service');
const { parseId } = require('../utils/validation');
const { nowSqlDateTime, todaySqlDate, addMinutesToSql } = require('../utils/schedule');

const UPCOMING_DAYS = 28;
const HISTORY_DAYS = 90;

async function getPlayerProfile(req, res, next) {
  try {
    const team = await teamRepository.findByCode(req.params.code);
    if (!team) return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    const userId = parseId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });

    const access = await teamAccess.requireMember(viewerOf(req), team.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const isSelf = userId === req.userId;
    const isParent = req.actingAs ? false : (req.access?.childIds ?? []).includes(userId);
    const roster = await teamRepository.getConfirmedRoster(team.id, {
      coachContact: true,
      playerContact: access.canManage || isSelf || isParent,
    });
    const asPlayer = roster.player.find((m) => m.id === userId) ?? null;
    const asCoach = roster.coach.find((m) => m.id === userId) ?? null;
    const person = asPlayer ?? asCoach;
    if (!person) return res.status(404).json({ message: 'Diese Person gehört nicht zum Kader.' });

    const today = todaySqlDate();
    const now = nowSqlDateTime();
    const [series, upcomingEvents, pastEvents, teams] = await Promise.all([
      eventRepository.listSeriesForTeam(team.id, now),
      eventRepository.listForTeams([team.id], now, addMinutesToSql(`${today} 23:59:59`, UPCOMING_DAYS * 1440)),
      asPlayer
        ? eventRepository.listForTeams([team.id], addMinutesToSql(`${today} 00:00:00`, -HISTORY_DAYS * 1440), now)
        : Promise.resolve([]),
      teamRepository.getTeamsForUser(userId),
    ]);

    // Nur laufende Serien sind „Trainingszeiten".
    const trainingTimes = series
      .filter((s) => String(s.endsOn).slice(0, 10) >= today && (s.upcomingCount ?? 0) > 0)
      .map((s) => ({
        id: s.id,
        title: s.title,
        weekdays: s.weekdays,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
      }));

    const next = upcomingEvents.filter((e) => !e.cancelledAt).slice(0, 6);
    const statusNext = asPlayer ? await scheduleService.buildStatusByEvent(next) : new Map();
    const upcoming = next.map((event) => {
      const entry = (statusNext.get(event.id) ?? []).find((s) => s.userId === userId);
      return {
        id: event.id,
        title: event.title,
        type: event.type,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        status: entry ? entry.status : null,
      };
    });

    let participation = null;
    if (asPlayer) {
      const counted = pastEvents.filter((e) => !e.cancelledAt);
      const statusPast = await scheduleService.buildStatusByEvent(counted);
      let total = 0;
      let attending = 0;
      for (const event of counted) {
        const entry = (statusPast.get(event.id) ?? []).find((s) => s.userId === userId);
        if (!entry) continue;
        total += 1;
        if (entry.status !== 'DECLINED') attending += 1;
      }
      participation = {
        days: HISTORY_DAYS,
        total,
        attending,
        rate: total === 0 ? null : Math.round((attending / total) * 100),
      };
    }

    return res.json({
      team: { id: team.id, code: team.code, name: team.name },
      person: {
        ...person,
        isPlayer: Boolean(asPlayer),
        isCoach: Boolean(asCoach),
        staffTitle: asCoach?.staffTitle ?? null,
        jerseyNumber: asPlayer?.jerseyNumber ?? null,
        position: asPlayer?.position ?? null,
      },
      otherTeams: teams
        .filter((t) => t.isConfirmed && t.id !== team.id && t.relationType !== 'fan')
        .map((t) => ({ id: t.id, code: t.code, name: t.name, relationType: t.relationType })),
      trainingTimes,
      upcoming,
      participation,
      viewer: { canManage: access.canManage, isSelf, isParent },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getPlayerProfile };
