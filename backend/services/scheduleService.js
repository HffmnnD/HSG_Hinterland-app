// Setzt die drei Datenquellen des Termin-Moduls zusammen: Kader,
// ausdrückliche Rückmeldungen und dauerhafte Abwesenheiten.
//
// Bewusst SAMMEL-Abfragen statt einer Abfrage je Termin: Die Terminliste
// zeigt schnell 50 Einheiten – mit N+1-Abfragen wäre sie unbenutzbar.
const teamRepository = require('../repositories/teamRepository');
const attendanceRepository = require('../repositories/attendanceRepository');
const {
  groupBy,
  buildRosterStatus,
  summarize,
  applyReasonVisibility,
} = require('./attendanceService');

/** `YYYY-MM-DDTHH:MM:SS` -> `YYYY-MM-DD`. */
const dayOf = (timestamp) => String(timestamp).slice(0, 10);

/**
 * Gültiger Status jedes Kadermitglieds für jeden übergebenen Termin.
 *
 * @param {object[]} events
 * @returns {Promise<Map<number, object[]>>} Termin-id -> Statuszeilen
 */
async function buildStatusByEvent(events) {
  const result = new Map();
  if (events.length === 0) return result;

  const teamIds = [...new Set(events.map((event) => event.teamId))];
  const eventIds = events.map((event) => event.id);

  const [rosterRows, attendances] = await Promise.all([
    teamRepository.listConfirmedPlayers(teamIds),
    attendanceRepository.listForEvents(eventIds),
  ]);

  const rosterByTeam = groupBy(rosterRows, 'teamId');

  // Abwesenheiten für den gesamten Zeitraum aller Termine in EINER Abfrage.
  // Ob ein Eintrag auf einen konkreten Termin passt (Datum UND Mannschaft),
  // entscheidet danach attendanceService.covers().
  const userIds = [...new Set(rosterRows.map((member) => member.id))];
  const days = events.flatMap((event) => [
    dayOf(event.startTime),
    dayOf(event.endTime),
  ]);
  const absences =
    userIds.length === 0
      ? []
      : await attendanceRepository.listOverlapping({
          userIds,
          teamId: null,
          fromDate: days.reduce((min, day) => (day < min ? day : min)),
          toDate: days.reduce((max, day) => (day > max ? day : max)),
        });

  const absencesByUser = groupBy(absences, 'userId');

  // Rückmeldungen nach Termin und Person greifbar machen.
  const attendanceByEvent = new Map();
  for (const attendance of attendances) {
    const perEvent =
      attendanceByEvent.get(attendance.eventId) ?? new Map();
    perEvent.set(attendance.userId, attendance);
    attendanceByEvent.set(attendance.eventId, perEvent);
  }

  for (const event of events) {
    result.set(
      event.id,
      buildRosterStatus(
        event,
        rosterByTeam.get(event.teamId) ?? [],
        attendanceByEvent.get(event.id) ?? new Map(),
        absencesByUser
      )
    );
  }

  return result;
}

/**
 * Darf der/die Anfragende bei DIESEM Termin die Abmeldegründe der anderen
 * sehen? Entweder als Verwaltung – oder weil der/die Trainer:in den Schalter
 * „Gründe für alle sichtbar" gesetzt hat.
 */
function canSeeReasons(event, { canManage }) {
  return Boolean(canManage) || event.reasonsVisibleToAll;
}

/**
 * Termin für die LISTE aufbereiten: Zahlen plus die Namen der Fehlenden.
 *
 * Wer fehlt, steht bewusst schon in der Liste – das ist die Frage, die sich
 * vor dem Training alle stellen. Warum jemand fehlt, hängt an der
 * Sichtbarkeits-Einstellung des Termins.
 */
function presentEventForList(event, entries, { viewer, access }) {
  const visible = canSeeReasons(event, access);
  const declined = applyReasonVisibility(
    entries.filter((entry) => entry.status === 'DECLINED'),
    { canSeeReasons: visible, viewerId: viewer.userId }
  );

  const mine = entries.find((entry) => entry.userId === viewer.userId) ?? null;

  return {
    ...event,
    canManage: access.canManage,
    // null = die Person gehört nicht zum Kader (z. B. reine:r Trainer:in);
    // sie sieht den Termin, muss aber nicht zu- oder absagen.
    myStatus: mine
      ? {
          status: mine.status,
          reason: mine.reason,
          source: mine.source,
          absenceType: mine.absenceType,
        }
      : null,
    counts: summarize(entries),
    declined,
    reasonsVisible: visible,
  };
}

/**
 * Termin für die DETAILANSICHT aufbereiten: vollständige Kaderliste,
 * getrennt nach Zu- und Absagen.
 */
function presentEventForDetail(event, entries, { viewer, access }) {
  const visible = canSeeReasons(event, access);
  const rows = applyReasonVisibility(entries, {
    canSeeReasons: visible,
    viewerId: viewer.userId,
  });

  return {
    ...event,
    canManage: access.canManage,
    reasonsVisible: visible,
    counts: summarize(entries),
    attending: rows.filter((entry) => entry.status === 'ATTENDING'),
    declined: rows.filter((entry) => entry.status === 'DECLINED'),
    myStatus:
      rows.find((entry) => entry.userId === viewer.userId) ?? null,
  };
}

module.exports = {
  buildStatusByEvent,
  canSeeReasons,
  presentEventForList,
  presentEventForDetail,
};
