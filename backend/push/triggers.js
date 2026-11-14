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
const dutyRepository = require('../duties/repository');
const newsExtras = require('../services/newsExtras');
const dutyCategories = require('../duties/categories');

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

  // --- Dienstplan ---------------------------------------------------------

  appEvents.subscribe('duties.published', async ({ plan, notify, actorId, added = null }) => {
    // Nur wenn beim Veröffentlichen der Haken gesetzt war. `added`: nur diese
    // Dienste kamen zu einem schon veröffentlichten Plan dazu.
    if (!notify) return;
    const now = nowLocalIso();
    const duties = (added ?? (await dutyRepository.listPlanDuties(plan.id))).filter(
      (duty) => duty.startTime > now
    );
    if (duties.length === 0) return;
    const kinds = [...new Set(duties.map((duty) => duty.category))];
    const volunteers = (await dutyRepository.listVolunteers()).filter((person) =>
      kinds.some((kind) => dutyCategories.canTake(kind, person))
    );
    await sendToUsers(
      volunteers.map((person) => person.id),
      'duties',
      messages.dutyPlanPublished(plan, duties, { added: Boolean(added) }),
      { exclude: actorId }
    );
  });

  appEvents.subscribe('duty.changed', async ({ before, after, userIds, actorId }) => {
    if (after.startTime <= nowLocalIso()) return;
    await sendToUsers(userIds, 'changes', messages.dutyChanged(before, after), {
      exclude: actorId,
    });
  });

  appEvents.subscribe('duty.removed', async ({ duty, userIds, actorId }) => {
    await sendToUsers(userIds, 'changes', messages.dutyRemoved(duty), { exclude: actorId });
  });

  appEvents.subscribe('duty.unassigned', async ({ duty, userId, actorId }) => {
    if (duty.startTime <= nowLocalIso()) return;
    await sendToUsers([userId], 'changes', messages.dutyUnassigned(duty), { exclude: actorId });
  });

  // Neuer Vereinstermin: alle, die ihn sehen dürfen (Verein oder Mannschaften).
  appEvents.subscribe('clubEvent.created', async ({ event, teamIds, actorId }) => {
    if (!event || event.startTime <= nowLocalIso()) return;
    let recipients = await repository.listSubscribedUserIds();
    if (event.audience === 'teams') {
      const allowed = new Set(await newsExtras.audienceUserIds(teamIds ?? []));
      recipients = recipients.filter((id) => allowed.has(id));
    }
    await sendToUsers(recipients, 'newEvents', messages.clubEvent(event), { exclude: actorId });
  });

  appEvents.subscribe('clubEvent.cancelled', async ({ event, actorId }) => {
    if (!event || event.startTime <= nowLocalIso()) return;
    let recipients = await repository.listSubscribedUserIds();
    if (event.audience === 'teams') {
      const allowed = new Set(await newsExtras.audienceUserIds(event.teams.map((team) => team.id)));
      recipients = recipients.filter((id) => allowed.has(id));
    }
    await sendToUsers(recipients, 'changes', messages.clubEventCancelled(event), { exclude: actorId });
  });

  appEvents.subscribe('news.published', async ({ news, actorId }) => {
    if (!news) return;
    let recipients = await repository.listSubscribedUserIds();
    // Beitrag nur für bestimmte Mannschaften: auch nur deren Mitglieder benachrichtigen.
    if (news.audience === 'teams') {
      const allowed = new Set(await newsExtras.audienceUserIds((news.teams ?? []).map((team) => team.id)));
      recipients = recipients.filter((id) => allowed.has(id));
    }
    await sendToUsers(recipients, 'news', messages.news(news), {
      exclude: actorId,
    });
  });
}

module.exports = { register };
