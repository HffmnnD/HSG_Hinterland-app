// Wann geht welche Nachricht an wen?
//
// Hört auf die fachlichen Ereignisse aus services/appEvents.js. Wer eine
// Änderung selbst gemacht hat, bekommt dazu nie eine Nachricht.
const appEvents = require('../services/appEvents');
const eventRepository = require('../repositories/eventRepository');
const repository = require('./repository');
const messages = require('./messages');
const { sendToUsers } = require('./sender');
const { SHORT_NOTICE_HOURS } = require('./config');
const { nowLocalIso } = require('../utils/schedule');

/** Liegt der Termin noch in der Zukunft? Vergangenes interessiert niemanden. */
const isUpcoming = (event) => event.startTime > nowLocalIso();

/** Spieler:innen und Trainerteam der Mannschaft. */
const teamAudience = (teamId) => repository.listTeamUserIds(teamId);

function register() {
  appEvents.subscribe('event.cancelled', async ({ event, reason, actorId }) => {
    if (!isUpcoming(event)) return;
    await sendToUsers(
      await teamAudience(event.teamId),
      'changes',
      messages.cancelled(event, reason),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('event.reinstated', async ({ event, actorId }) => {
    if (!isUpcoming(event)) return;
    await sendToUsers(
      await teamAudience(event.teamId),
      'changes',
      messages.reinstated(event),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('event.deleted', async ({ event, actorId }) => {
    if (!isUpcoming(event) || event.cancelledAt) return;
    await sendToUsers(
      await teamAudience(event.teamId),
      'changes',
      messages.deleted(event),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('event.updated', async ({ before, after, actorId }) => {
    if (!after || !isUpcoming(after) || after.cancelledAt) return;
    const message = messages.changed(before, after);
    if (!message) return;
    await sendToUsers(await teamAudience(after.teamId), 'changes', message, {
      exclude: actorId,
    });
  });

  appEvents.subscribe('event.rescheduled', async ({ event, previousStart, newStart }) => {
    if (newStart <= nowLocalIso()) return;
    await sendToUsers(
      await teamAudience(event.teamId),
      'changes',
      messages.rescheduled(event, previousStart, newStart)
    );
  });

  appEvents.subscribe('series.updated', async ({ event, fields, changed, actorId }) => {
    // Eine Serie ändert nur Stammdaten. Betreffen tut das niemanden außer
    // einem Hallenwechsel.
    if (!changed || !('location' in fields)) return;
    if ((event.location ?? null) === (fields.location ?? null)) return;
    await sendToUsers(
      await teamAudience(event.teamId),
      'changes',
      messages.seriesMoved({ ...event, location: fields.location }),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('series.ended', async ({ series, removed, actorId }) => {
    if (!removed) return;
    const team = await repository.findTeam(series.teamId);
    await sendToUsers(
      await teamAudience(series.teamId),
      'changes',
      messages.seriesEnded(series, team?.name ?? '', removed),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('event.created', async ({ teamId, seriesId, eventId, actorId }) => {
    let message;
    if (seriesId) {
      const series = await eventRepository.findSeriesById(seriesId);
      const team = await repository.findTeam(teamId);
      if (!series || !team) return;
      message = messages.seriesCreated(series, team.name);
    } else {
      const event = await eventRepository.findById(eventId);
      if (!event || !isUpcoming(event)) return;
      message = messages.created(event);
    }
    await sendToUsers(await teamAudience(teamId), 'newEvents', message, {
      exclude: actorId,
    });
  });

  appEvents.subscribe('attendance.changed', async ({ event, userId, status, reason, actorId }) => {
    // Nur eigene, kurzfristige Absagen. Trägt das Trainerteam selbst ein,
    // weiß es ja schon Bescheid.
    if (status !== 'DECLINED' || actorId !== userId || !isUpcoming(event)) return;
    const hoursLeft = (new Date(event.startTime).getTime() - Date.now()) / 3600000;
    if (hoursLeft > SHORT_NOTICE_HOURS) return;

    const person = await repository.findUserName(userId);
    if (!person) return;
    await sendToUsers(
      await repository.listTeamUserIds(event.teamId, ['coach']),
      'declines',
      messages.shortNoticeDecline(event, person, userId, reason),
      { exclude: userId }
    );
  });

  appEvents.subscribe('membership.changed', async ({ userId }) => {
    // Neue offene Anfragen ans Trainerteam melden – jede genau einmal, auch
    // wenn jemand die Mannschaftswahl mehrmals speichert.
    for (const request of await repository.listPendingRequests(userId)) {
      const key = `request:${userId}:${request.team_id}:${request.relation_type}`;
      const coaches = await repository.listTeamUserIds(request.team_id, ['coach']);
      const fresh = [];
      for (const coachId of coaches) {
        if (coachId !== userId && (await repository.claimOnce(coachId, key))) {
          fresh.push(coachId);
        }
      }
      await sendToUsers(fresh, 'requests', messages.joinRequest(request));
    }
  });

  appEvents.subscribe('membership.confirmed', async ({ userId, teamId, relationType, actorId }) => {
    if (relationType === 'fan' || userId === actorId) return;
    const team = await repository.findTeam(teamId);
    if (!team) return;
    await sendToUsers([userId], 'roster', messages.membershipConfirmed(team, relationType));
  });

  appEvents.subscribe('news.published', async ({ news, actorId }) => {
    if (!news) return;
    await sendToUsers(await repository.listSubscribedUserIds(), 'news', messages.news(news), {
      exclude: actorId,
    });
  });
}

module.exports = { register };
