// Fachliche Auswertung der Anwesenheit: Aus Kader, ausdrücklichen
// Rückmeldungen und dauerhaften Abwesenheiten wird EIN gültiger Status je
// Person und Termin.
//
// Reine Funktionen, kein Datenbankzugriff – damit die Regeln an einer Stelle
// stehen und sich ohne laufende Datenbank nachvollziehen lassen.
//
// Die drei Regeln, nach denen entschieden wird:
//
//  1. Keine Rückmeldung, keine Abwesenheit  ->  ZUGESAGT.
//     Im Training ist Dabeisein der Normalfall; melden muss sich nur, wer
//     nicht kommt.
//
//  2. Eine dauerhafte Abwesenheit (Urlaub/Verletzung), die den Termin
//     überschneidet  ->  ABGESAGT mit dem Grund der Abwesenheit.
//
//  3. Sagen Rückmeldung und Abwesenheit Unterschiedliches, gilt die JÜNGERE
//     Angabe. Wer erst zusagt und danach Urlaub einträgt, ist im Urlaub. Wer
//     im eingetragenen Urlaub für ein einzelnes Training ausdrücklich zusagt
//     („bin früher zurück"), ist an diesem Termin dabei.
const {
  DEFAULT_STATUS,
  STATUS_SOURCES,
  ABSENCE_TYPES,
} = require('../utils/schedule');

// Fällt keine Notiz an, steht die Art der Abwesenheit als Grund im Kader.
const ABSENCE_REASONS = {
  VACATION: 'Urlaub',
  INJURY: 'Verletzung',
  OTHER: 'Abwesend',
};

/** Deutscher Anzeigetext für eine dauerhafte Abwesenheit. */
function absenceReason(absence) {
  const label = ABSENCE_REASONS[absence.type] ?? ABSENCE_REASONS.OTHER;
  return absence.note ? `${label}: ${absence.note}` : label;
}

/** `YYYY-MM-DDTHH:MM:SS` -> `YYYY-MM-DD` (reine Zeichenkettenarbeit). */
const dayOf = (timestamp) => String(timestamp).slice(0, 10);

/**
 * Überschneidet die Abwesenheit den Termin?
 * Bei mehrtägigen Terminen (Camp) genügt EIN gemeinsamer Tag.
 */
function covers(absence, event) {
  if (absence.teamId !== null && absence.teamId !== event.teamId) return false;
  // ISO-Datumstexte lassen sich direkt vergleichen.
  return (
    absence.startDate <= dayOf(event.endTime) &&
    absence.endDate >= dayOf(event.startTime)
  );
}

/**
 * Die maßgebliche Abwesenheit für einen Termin: die zuletzt eingetragene.
 * @returns {object|null}
 */
function pickAbsence(absences, event) {
  let picked = null;
  for (const absence of absences) {
    if (!covers(absence, event)) continue;
    if (
      !picked ||
      absence.createdAt > picked.createdAt ||
      (absence.createdAt === picked.createdAt && absence.id > picked.id)
    ) {
      picked = absence;
    }
  }
  return picked;
}

/**
 * Gültiger Status einer Person für EINEN Termin.
 *
 * @param {{ id:number, teamId:number, startTime:string, endTime:string }} event
 * @param {object|null} attendance  ausdrückliche Rückmeldung oder null
 * @param {object[]} absences       dauerhafte Abwesenheiten DIESER Person
 * @param {number} userId
 * @returns {{ status:string, reason:string|null, source:string,
 *             absenceType:string|null, setByUserId:number|null,
 *             updatedAt:string|null }}
 */
function resolveStatus(event, attendance, absences, userId) {
  const absence = pickAbsence(absences ?? [], event);

  // Regel 3: Die Rückmeldung schlägt die Abwesenheit nur, wenn sie jünger ist.
  const attendanceWins =
    attendance && (!absence || attendance.updatedAt > absence.createdAt);

  if (absence && !attendanceWins) {
    return {
      status: 'DECLINED',
      reason: absenceReason(absence),
      source: STATUS_SOURCES.ABSENCE,
      absenceType: absence.type,
      setByUserId: null,
      updatedAt: absence.createdAt,
    };
  }

  if (attendance) {
    return {
      status: attendance.status,
      reason: attendance.reason,
      // Hat jemand anderes gespeichert, hat der/die Trainer:in übersteuert.
      source:
        attendance.setByUserId && attendance.setByUserId !== userId
          ? STATUS_SOURCES.COACH
          : STATUS_SOURCES.SELF,
      absenceType: null,
      setByUserId: attendance.setByUserId,
      updatedAt: attendance.updatedAt,
    };
  }

  // Regel 1: ohne jede Angabe ist die Person dabei.
  return {
    status: DEFAULT_STATUS,
    reason: null,
    source: STATUS_SOURCES.DEFAULT,
    absenceType: null,
    setByUserId: null,
    updatedAt: null,
  };
}

// --- Aufbereitung für die Oberfläche ---------------------------------------

/** Hilfsfunktion: Liste nach einem Schlüssel gruppieren. */
function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row[key]);
    if (list) list.push(row);
    else map.set(row[key], [row]);
  }
  return map;
}

/**
 * Anwesenheitsliste eines Termins: je Kadermitglied eine Zeile mit gültigem
 * Status.
 *
 * @param {object} event
 * @param {object[]} roster                Kader (bestätigte Spieler:innen)
 * @param {Map<number, object>} attendanceByUser
 * @param {Map<number, object[]>} absencesByUser
 */
function buildRosterStatus(event, roster, attendanceByUser, absencesByUser) {
  return roster.map((member) => {
    const resolved = resolveStatus(
      event,
      attendanceByUser.get(member.id) ?? null,
      absencesByUser.get(member.id) ?? [],
      member.id
    );
    return {
      userId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      jerseyNumber: member.jerseyNumber ?? null,
      ...resolved,
    };
  });
}

/** Zusagen / Absagen zählen. */
function summarize(entries) {
  let attending = 0;
  let declined = 0;
  for (const entry of entries) {
    if (entry.status === 'DECLINED') declined += 1;
    else attending += 1;
  }
  return { attending, declined, rosterSize: entries.length };
}

/**
 * Entfernt Abmeldegründe, die der/die Anfragende nicht sehen darf.
 *
 * Sichtbar sind Gründe
 *   - für Trainer:innen und Administration immer,
 *   - für alle, wenn `reasons_visible_to_all` beim Termin gesetzt ist,
 *   - für den eigenen Eintrag immer.
 *
 * WER fehlt, bleibt in jedem Fall sichtbar – nur das WARUM verschwindet.
 */
function applyReasonVisibility(entries, { canSeeReasons, viewerId }) {
  if (canSeeReasons) return entries;
  return entries.map((entry) => {
    if (entry.userId === viewerId || !entry.reason) return entry;
    return {
      ...entry,
      reason: null,
      // Auch die Art der Abwesenheit verrät den Grund („Verletzung").
      absenceType: null,
      // Damit die Oberfläche „Grund nur für Trainer:innen sichtbar" anzeigen
      // kann, statt so zu tun, als gäbe es keinen.
      reasonHidden: true,
    };
  });
}

module.exports = {
  ABSENCE_TYPES,
  ABSENCE_REASONS,
  absenceReason,
  covers,
  resolveStatus,
  groupBy,
  buildRosterStatus,
  summarize,
  applyReasonVisibility,
};
