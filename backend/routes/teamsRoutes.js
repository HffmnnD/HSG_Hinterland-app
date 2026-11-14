const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  listTeams,
  getTeam,
  updateTeam,
  updateTeamSettings,
  setTeamPhoto,
  setTeamPhotoFrame,
  deleteTeamPhoto,
  listCandidates,
  addMember,
  confirmMember,
  updateMemberDetails,
  removeMember,
} = require('../controllers/teamsController');
const { getPlayerProfile } = require('../controllers/playerController');
const { authenticate } = require('../middleware/authMiddleware');
const { uploadTeamPhoto } = require('../config/uploads');

const router = express.Router();

// Der Foto-Upload nimmt bis zu 5 MB je Anfrage an und schreibt auf die Platte.
// Selbst wenn nur Administration ihn erreicht: ein durchgedrehtes Skript oder
// ein übernommenes Konto soll die Platte nicht vollschreiben können. Zehn
// Uploads pro Viertelstunde reichen für jeden echten Anlass.
const photoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Zu viele Bild-Uploads. Bitte in einigen Minuten erneut versuchen.',
  },
});

// Angemeldet; authenticate liest Sperre und Rechte bei jeder Anfrage frisch.
const requireAuth = [authenticate];

// Die Mannschaftsliste war früher öffentlich, weil das Registrierungsformular
// sie ohne Anmeldung gebraucht hat. Das Formular fragt nur noch Name, E-Mail
// und Passwort ab – die Mannschaftswahl passiert im Onboarding, also nach dem
// Login. Damit gibt es keinen Grund mehr, die Struktur des Vereins anonym
// herauszugeben.
router.get('/', requireAuth, listTeams);

router.get('/:code', requireAuth, getTeam);

// Stammdaten der Mannschaft (nuLiga-Nummer, Mannschaftsfoto). Die
// Rollenprüfung auf admin/sub_admin macht der Controller – hier steht nur die
// allgemeine Anmeldepflicht.
router.patch('/:code', requireAuth, updateTeam);
// Einstellungen der Mannschaft (Strafen, Teamplaner, Beitritt) – Trainer:innen
router.patch('/:code/settings', requireAuth, updateTeamSettings);
// Reihenfolge beachtet: erst bremsen, dann anmelden, DANN erst die Datei
// entgegennehmen – so landet eine abgelehnte Anfrage gar nicht erst auf der
// Platte.
router.post('/:code/photo', photoLimiter, requireAuth, uploadTeamPhoto, setTeamPhoto);
// Bildausschnitt des Kopfbereichs. Kein Upload-Limit: hier gehen nur drei
// Zahlen über die Leitung, und beim Ausrichten speichert man gern mehrmals.
router.patch('/:code/photo/frame', requireAuth, setTeamPhotoFrame);
router.delete('/:code/photo', requireAuth, deleteTeamPhoto);

router.get('/:code/candidates', requireAuth, listCandidates);
router.post('/:code/members', requireAuth, addMember);
router.post('/:code/members/:userId/confirm', requireAuth, confirmMember);
// Kaderangaben: Rückennummer, Position, Bezeichnung im Betreuerstab.
router.patch('/:code/members/:userId', requireAuth, updateMemberDetails);
// Spieler-Ansicht: Trainingszeiten, nächste Termine, Beteiligung.
router.get('/:code/members/:userId/profile', requireAuth, getPlayerProfile);
router.delete('/:code/members/:userId', requireAuth, removeMember);

module.exports = router;
