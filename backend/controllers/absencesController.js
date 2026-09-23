// Controller für dauerhafte Abwesenheiten (/api/absences/long-term).
//
//   GET    /api/absences/long-term?teamId=&userId=&includePast=
//   POST   /api/absences/long-term
//   DELETE /api/absences/long-term/:id
//
// Urlaub und Verletzung trägt in aller Regel die Person selbst ein. Der/die
// Trainer:in darf es für Spieler:innen der eigenen Mannschaft ebenfalls –
// eine Verletzung meldet sich oft beim Training und nicht in der App.
//
// Kein SQL in dieser Datei.
const attendanceRepository = require('../repositories/attendanceRepository');
const teamRepository = require('../repositories/teamRepository');
const teamAccess = require('../services/teamAccess');
const { parseId } = require('../utils/validation');
const { validateAbsence } = require('../utils/scheduleValidation');
const { todaySqlDate } = require('../utils/schedule');

const FOREIGN_ABSENCE =
  'Du kannst nur deine eigenen Abwesenheiten eintragen.';
const TEAM_REQUIRED =
  'Für eine fremde Person muss die Mannschaft angegeben werden.';

// GET /api/absences/long-term
//
// Ohne Parameter: die eigenen laufenden und künftigen Einträge.
// Mit `teamId` (und Verwaltungsrechten): alle Einträge des Kaders – die
// Übersicht „wer fehlt gerade längerfristig".
async function listLongTerm(req, res, next) {
  try {
    const viewer = { userId: req.userId, userRole: req.userRole };
    // Abgelaufene Einträge nur auf ausdrücklichen Wunsch – sonst wächst die
    // Liste mit jeder Saison, ohne dass sie jemand braucht.
    const fromDate = req.query.includePast === 'true' ? null : todaySqlDate();

    if (req.query.teamId !== undefined) {
      const teamId = parseId(req.query.teamId);
      if (!teamId) {
        return res.status(400).json({ message: 'Ungültige Mannschafts-ID.' });
      }
      const access = await teamAccess.requireManager(viewer, teamId);
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }

      const absences = await attendanceRepository.listForTeam(
        teamId,
        fromDate ?? '1970-01-01'
      );
      return res.json({ absences, scope: 'team' });
    }

    const absences = await attendanceRepository.listForUser(req.userId, {
      fromDate,
    });
    return res.json({ absences, scope: 'own' });
  } catch (err) {
    return next(err);
  }
}

// POST /api/absences/long-term
//   Body: { type, startDate, endDate, note?, teamId?, userId? }
//
// `teamId` leer lassen heißt „gilt für alle meine Mannschaften" – der
// Normalfall bei Urlaub und Verletzung.
async function createLongTerm(req, res, next) {
  try {
    const input = validateAbsence(req.body);
    if (!input.ok) {
      return res.status(input.status).json({ message: input.message });
    }

    const viewer = { userId: req.userId, userRole: req.userRole };
    const targetId =
      req.body?.userId === undefined || req.body?.userId === null
        ? req.userId
        : parseId(req.body.userId);

    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    if (targetId !== req.userId) {
      // Für andere eintragen geht nur mannschaftsbezogen: ohne Mannschaft
      // ließe sich sonst eine Abwesenheit für ALLE Teams einer fremden Person
      // setzen – auch für die, die der/die Trainer:in gar nicht verantwortet.
      if (input.fields.team_id === null) {
        return res.status(400).json({ message: TEAM_REQUIRED });
      }
      const access = await teamAccess.requireManager(
        viewer,
        input.fields.team_id,
        FOREIGN_ABSENCE
      );
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
      const inRoster = await teamRepository.hasConfirmedRelation(
        targetId,
        input.fields.team_id,
        'player'
      );
      if (!inRoster) {
        return res
          .status(400)
          .json({ message: 'Diese Person steht nicht im Kader der Mannschaft.' });
      }
    } else if (input.fields.team_id !== null) {
      // Eigene Abwesenheit auf eine Mannschaft beschränken: die muss man
      // natürlich auch selbst sehen dürfen.
      const access = await teamAccess.requireMember(viewer, input.fields.team_id);
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    const id = await attendanceRepository.createAbsence({
      userId: targetId,
      fields: input.fields,
    });

    return res.status(201).json({
      message:
        'Abwesenheit gespeichert. Alle Termine in diesem Zeitraum sind jetzt als Absage hinterlegt.',
      id,
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/absences/long-term/:id
async function deleteLongTerm(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige ID.' });
    }

    const absence = await attendanceRepository.findAbsenceById(id);
    if (!absence) {
      return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
    }

    if (absence.userId !== req.userId) {
      // Fremde Einträge darf nur löschen, wer die betroffene Mannschaft
      // verwaltet. Ein Eintrag ohne Mannschaft (gilt überall) gehört allein
      // der Person selbst.
      if (absence.teamId === null) {
        return res.status(403).json({ message: FOREIGN_ABSENCE });
      }
      const access = await teamAccess.requireManager(
        { userId: req.userId, userRole: req.userRole },
        absence.teamId,
        FOREIGN_ABSENCE
      );
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }
    }

    await attendanceRepository.deleteAbsence(id);
    return res.json({ message: 'Abwesenheit entfernt.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listLongTerm, createLongTerm, deleteLongTerm };
