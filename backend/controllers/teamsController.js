// Mannschafts-Controller (/api/teams/*).
//
// Kein SQL in dieser Datei – Datenzugriff über teamRepository/userRepository.
//   GET  /api/teams                              öffentliche Mannschaftsliste
//   GET  /api/teams/:code                        Infos + bestätigter Kader
//                                                (+ offene Anfragen für Verwaltung)
//   PATCH /api/teams/:code                       Stammdaten (nuLiga-Nummer)
//   POST /api/teams/:code/photo                  Mannschaftsfoto setzen
//   PATCH /api/teams/:code/photo/frame           Bildausschnitt des Banners
//   DEL  /api/teams/:code/photo                  Mannschaftsfoto entfernen
//   PATCH /api/teams/:code/members/:userId       Kaderangaben (Nummer/Position)
//   GET  /api/teams/:code/candidates             Auswahlliste zum Hinzufügen (Verwaltung)
//   POST /api/teams/:code/members                Zuordnung anlegen (Verwaltung)
//   POST /api/teams/:code/members/:userId/confirm offene Anfrage bestätigen (Verwaltung)
//   DEL  /api/teams/:code/members/:userId        Zuordnung entfernen / Anfrage ablehnen
//
// "Verwaltung" = Rolle admin/sub_admin ODER als bestätigte:r coach dieser
// Mannschaft eingetragen.
const teamRepository = require('../repositories/teamRepository');
const userRepository = require('../repositories/userRepository');
const {
  parseId,
  isRelationType,
  validateTeamPatch,
  validateRosterPatch,
  validatePhotoFrame,
} = require('../utils/validation');
const { ADMIN_ROLES, RELATION_TYPES } = require('../utils/roles');
const {
  publicUrlFor,
  teamPhotoPathFor,
  hasValidImageSignature,
  removeUpload,
} = require('../config/uploads');

const MANAGE_ROSTER_DENIED =
  'Nur Trainer:innen dieser Mannschaft dürfen den Kader ändern.';
const TEAM_DATA_DENIED =
  'Nur Administrator:innen dürfen die Stammdaten der Mannschaft ändern.';

/**
 * Mannschaft für die Ausgabe aufbereiten: der gespeicherte Foto-Pfad wird zur
 * abrufbaren URL. Der interne Dateipfad verlässt den Server nicht.
 */
function presentTeam(team) {
  const { photoPath, ...rest } = team;
  return { ...rest, photoUrl: publicUrlFor(photoPath) };
}

/**
 * Lädt die Mannschaft per Code und prüft, ob der:die Anfragende sie verwalten
 * darf. Gibt entweder `{ ok:true, team }` oder eine fertige Fehler-Antwort.
 */
async function loadManageableTeam(req, code, deniedMessage) {
  const team = await teamRepository.findByCode(code);
  if (!team) {
    return { ok: false, status: 404, message: 'Mannschaft nicht gefunden.' };
  }
  const canManage =
    ADMIN_ROLES.includes(req.userRole) ||
    (await teamRepository.hasConfirmedRelation(req.userId, team.id, 'coach'));
  if (!canManage) {
    return { ok: false, status: 403, message: deniedMessage };
  }
  return { ok: true, team };
}

// GET /api/teams  (angemeldet)
async function listTeams(req, res, next) {
  try {
    const teams = await teamRepository.listAll();
    return res.json({ teams });
  } catch (err) {
    return next(err);
  }
}

// GET /api/teams/:code
async function getTeam(req, res, next) {
  try {
    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }

    // „Darf verwalten" und „gehört zum Kader" kommen aus EINER Abfrage; für
    // die Verwaltung erübrigt sie sich, weil dort beides ohnehin gilt.
    const isAdmin = ADMIN_ROLES.includes(req.userRole);
    const { isMember, isCoach } = isAdmin
      ? { isMember: true, isCoach: true }
      : await teamRepository.getSquadMembership(req.userId, team.id);
    const canManage = isAdmin || isCoach;

    // Der Kader enthält nur bestätigte Mitglieder. Kontaktdaten des
    // Trainerteams sehen alle, die selbst zu dieser Mannschaft gehören, die
    // der Spieler:innen nur das Trainerteam (siehe teamRepository.mapMember).
    const [members, sponsors] = await Promise.all([
      teamRepository.getConfirmedRoster(team.id, {
        coachContact: isMember,
        playerContact: canManage,
      }),
      teamRepository.getSponsors(team.id),
    ]);

    const response = {
      team: presentTeam(team),
      sponsors,
      members,
      // Gezählt wird der Kader. Fans erscheinen hier BEWUSST nicht: die
      // fan-Zuordnung steuert nur, wessen Spiele jemand angezeigt bekommt –
      // eine Zahl dazu hat für die Mannschaft keine Bedeutung.
      counts: {
        player: members.player.length,
        coach: members.coach.length,
      },
      canManage,
    };

    // Verwaltung sieht zusätzlich die offenen Beitrittsanfragen.
    if (canManage) {
      response.pendingMembers = await teamRepository.getPendingMembers(team.id, {
        coachContact: true,
        playerContact: true,
      });
    }

    return res.json(response);
  } catch (err) {
    return next(err);
  }
}

// GET /api/teams/:code/candidates?relationType=player
async function listCandidates(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    const candidates = await teamRepository.listRosterCandidates(
      loaded.team.id,
      relationType
    );
    return res.json({ candidates });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/members   Body: { userId, relationType? }
async function addMember(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const { userId, relationType = 'player' } = req.body || {};
    const targetId = parseId(userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }
    if (!isRelationType(relationType)) {
      return res.status(400).json({
        message: `Ungültiger Beziehungstyp. Erlaubt: ${RELATION_TYPES.join(', ')}.`,
      });
    }

    const target = await userRepository.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }
    if (!target.is_approved) {
      return res.status(400).json({
        message: 'Nur aktive Mitglieder können zugeordnet werden.',
      });
    }

    // Vom Trainer/Admin manuell hinzugefügt -> direkt bestätigt.
    await teamRepository.addRelation(targetId, loaded.team.id, relationType, 1);

    // Wie bei /confirm: bestätigte Trainer-Beziehung -> globale Rolle anheben.
    let roleUpgraded = false;
    if (relationType === 'coach') {
      roleUpgraded = await userRepository.promoteToTrainerIfBasic(targetId);
    }

    return res.status(201).json({
      message: roleUpgraded
        ? 'Zuordnung gespeichert. Die Person hat jetzt die Rolle „Trainer:in".'
        : 'Zuordnung gespeichert.',
      roleUpgraded,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/members/:userId/confirm
async function confirmMember(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const targetId = parseId(req.params.userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    // Der Beziehungstyp ist PFLICHT. Ohne ihn hätte `confirmRelations` alle
    // offenen Anfragen dieser Person auf einmal bestätigt – wer gleichzeitig
    // als Spieler:in und als Trainer:in angefragt hat, wäre mit einem Klick
    // auf „Bestätigen" in der Spielerzeile auch Trainer:in geworden (und
    // global zur Rolle `trainer` hochgestuft). Eine Rechteerweiterung darf
    // nicht als Nebenwirkung passieren.
    const relationType = req.query.relationType;
    if (!isRelationType(relationType)) {
      return res.status(400).json({
        message: `Bitte angeben, welche Anfrage bestätigt wird (relationType: ${RELATION_TYPES.join(', ')}).`,
      });
    }

    const confirmed = await teamRepository.confirmRelations(
      targetId,
      loaded.team.id,
      relationType
    );
    if (confirmed === 0) {
      return res
        .status(404)
        .json({ message: 'Keine offene Beitrittsanfrage gefunden.' });
    }

    // Wurde eine Trainer-Beziehung bestätigt, bekommt der Nutzer auch die
    // globale Rolle 'trainer' (sofern er bisher nur spieler/zuschauer war).
    let roleUpgraded = false;
    if (relationType === 'coach') {
      const nowCoach = await teamRepository.hasConfirmedRelation(
        targetId,
        loaded.team.id,
        'coach'
      );
      if (nowCoach) {
        roleUpgraded = await userRepository.promoteToTrainerIfBasic(targetId);
      }
    }

    return res.json({
      message: roleUpgraded
        ? 'Beitritt bestätigt. Die Person hat jetzt die Rolle „Trainer:in".'
        : 'Beitritt bestätigt.',
      roleUpgraded,
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/teams/:code/members/:userId?relationType=player
async function removeMember(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const targetId = parseId(req.params.userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    // Trainer:innen dürfen sich nicht selbst die Trainerrolle entziehen –
    // sonst verlieren sie den Zugriff auf die Seite.
    if (
      relationType === 'coach' &&
      targetId === req.userId &&
      !ADMIN_ROLES.includes(req.userRole)
    ) {
      return res.status(400).json({
        message:
          'Du kannst dich nicht selbst als Trainer:in dieser Mannschaft entfernen.',
      });
    }

    const result = await teamRepository.removeRelation(
      targetId,
      loaded.team.id,
      relationType
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Zuordnung nicht gefunden.' });
    }
    return res.json({ message: 'Zuordnung entfernt.' });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/teams/:code   Body: { name?, ageGroup?, gender?, handballTeamId? }
//
// Stammdaten der Mannschaft. Bewusst NUR für admin/sub_admin: die
// nuLiga-Nummer entscheidet, welche Tabelle und welcher Spielplan auf der
// Mannschaftsseite stehen – eine falsche Nummer zeigt allen Mitgliedern die
// Daten einer fremden Mannschaft. Name, Altersklasse und Geschlecht sind
// ebenfalls Vereins-Stammdaten und keine Kaderdetails.
//
// `code` fehlt bewusst: es steht in Links, Lesezeichen und in der
// Startseiten-Verknüpfung der PWA. Ein Kürzel zu ändern hiesse, all das
// stillschweigend kaputtzumachen.
async function updateTeam(req, res, next) {
  try {
    if (!ADMIN_ROLES.includes(req.userRole)) {
      return res.status(403).json({ message: TEAM_DATA_DENIED });
    }

    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }

    const check = validateTeamPatch(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    await teamRepository.updateTeam(team.id, check.fields);

    // Die Meldung soll sagen, was tatsächlich passiert ist. Wird NUR die
    // Ligaverknüpfung angefasst, ist deren Zustand die Nachricht – sonst
    // genügt die allgemeine Bestätigung.
    const onlyLeague =
      Object.keys(check.fields).length === 1 &&
      'handball_team_id' in check.fields;

    return res.json({
      message: onlyLeague
        ? check.fields.handball_team_id
          ? 'Ligaverknüpfung gespeichert.'
          : 'Ligaverknüpfung entfernt.'
        : 'Stammdaten gespeichert.',
      // Über presentTeam, damit der interne Dateipfad des Fotos den Server
      // nicht verlässt (er wird zur URL).
      team: presentTeam(await teamRepository.findByCode(req.params.code)),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/teams/:code/photo   multipart/form-data, Feld `photo`
async function setTeamPhoto(req, res, next) {
  // Ab hier liegt die Datei bereits auf der Platte (multer). Jeder Fehlerpfad
  // muss sie deshalb selbst wieder aufräumen, sonst bleibt sie verwaist.
  const cleanup = async () => {
    if (req.file) await removeUpload(teamPhotoPathFor(req.file));
  };

  try {
    if (!ADMIN_ROLES.includes(req.userRole)) {
      await cleanup();
      return res.status(403).json({ message: TEAM_DATA_DENIED });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Bitte ein Bild auswählen.' });
    }

    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      await cleanup();
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }

    const storedPath = teamPhotoPathFor(req.file);
    // Der MIME-Typ kommt vom Client – der Inhalt muss wirklich ein Bild sein.
    if (!(await hasValidImageSignature(storedPath, req.file.mimetype))) {
      await cleanup();
      return res
        .status(400)
        .json({ message: 'Die Datei ist kein gültiges Bild.' });
    }

    // Ein neues Foto startet mittig und uneingezoomt: Der Ausschnitt des
    // vorherigen Bildes passt zu diesem nicht.
    await teamRepository.updateTeam(team.id, {
      photo_path: storedPath,
      photo_focus_x: 50,
      photo_focus_y: 50,
      photo_zoom: 100,
    });
    // Erst nach dem erfolgreichen Speichern das alte Foto löschen.
    if (team.photoPath) await removeUpload(team.photoPath);

    return res.status(201).json({
      message: 'Mannschaftsfoto gespeichert.',
      photoUrl: publicUrlFor(storedPath),
      // Das Frontend öffnet direkt danach den Ausschnitt-Dialog und braucht
      // dafür die Mannschaft mit den zurückgesetzten Werten.
      team: presentTeam(await teamRepository.findById(team.id)),
    });
  } catch (err) {
    await cleanup();
    return next(err);
  }
}

// PATCH /api/teams/:code/photo/frame   Body: { focusX?, focusY?, zoom? }
//
// Speichert, WIE das Foto im Kopfbereich liegt – nicht ein zugeschnittenes
// Bild. Deshalb ein eigener Endpunkt neben dem Upload: Der Ausschnitt lässt
// sich beliebig oft nachjustieren, ohne das Bild erneut hochzuladen, und das
// Original bleibt in voller Auflösung erhalten.
async function setTeamPhotoFrame(req, res, next) {
  try {
    if (!ADMIN_ROLES.includes(req.userRole)) {
      return res.status(403).json({ message: TEAM_DATA_DENIED });
    }

    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!team.photoPath) {
      return res.status(409).json({
        message: 'Für diese Mannschaft ist kein Foto hinterlegt.',
      });
    }

    const check = validatePhotoFrame(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    await teamRepository.updateTeam(team.id, check.fields);

    return res.json({
      message: 'Bildausschnitt gespeichert.',
      team: presentTeam(await teamRepository.findById(team.id)),
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/teams/:code/photo
async function deleteTeamPhoto(req, res, next) {
  try {
    if (!ADMIN_ROLES.includes(req.userRole)) {
      return res.status(403).json({ message: TEAM_DATA_DENIED });
    }

    const team = await teamRepository.findByCode(req.params.code);
    if (!team) {
      return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    }
    if (!team.photoPath) {
      return res
        .status(404)
        .json({ message: 'Kein Mannschaftsfoto hinterlegt.' });
    }

    // Den Ausschnitt gleich mit zurücksetzen: Er beschreibt das entfernte
    // Bild. Bliebe er stehen, läge das nächste Foto von Anfang an schief.
    await teamRepository.updateTeam(team.id, {
      photo_path: null,
      photo_focus_x: 50,
      photo_focus_y: 50,
      photo_zoom: 100,
    });
    await removeUpload(team.photoPath);
    return res.json({ message: 'Mannschaftsfoto entfernt.' });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/teams/:code/members/:userId?relationType=player
//   Body: { jerseyNumber?, position?, staffTitle? }
async function updateMemberDetails(req, res, next) {
  try {
    const loaded = await loadManageableTeam(
      req,
      req.params.code,
      MANAGE_ROSTER_DENIED
    );
    if (!loaded.ok) {
      return res.status(loaded.status).json({ message: loaded.message });
    }

    const targetId = parseId(req.params.userId);
    if (!targetId) {
      return res.status(400).json({ message: 'Ungültige Benutzer-ID.' });
    }

    const relationType = req.query.relationType ?? 'player';
    if (!isRelationType(relationType)) {
      return res.status(400).json({ message: 'Ungültiger Beziehungstyp.' });
    }

    const check = validateRosterPatch(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    // Eine Rückennummer darf im Kader nur einmal vorkommen – sonst stimmt der
    // Spielberichtsbogen nicht mehr mit der App überein.
    if (check.fields.jersey_number != null) {
      const taken = await teamRepository.isJerseyNumberTaken(
        loaded.team.id,
        check.fields.jersey_number,
        targetId
      );
      if (taken) {
        return res.status(409).json({
          message: `Die Rückennummer ${check.fields.jersey_number} ist in dieser Mannschaft schon vergeben.`,
        });
      }
    }

    const changed = await teamRepository.updateRelationDetails(
      targetId,
      loaded.team.id,
      relationType,
      check.fields
    );
    if (changed === 0) {
      return res.status(404).json({ message: 'Zuordnung nicht gefunden.' });
    }

    return res.json({ message: 'Kaderangaben gespeichert.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listTeams,
  getTeam,
  updateTeam,
  setTeamPhoto,
  setTeamPhotoFrame,
  deleteTeamPhoto,
  updateMemberDetails,
  listCandidates,
  addMember,
  confirmMember,
  removeMember,
};
