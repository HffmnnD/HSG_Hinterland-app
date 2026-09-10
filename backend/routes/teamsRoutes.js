const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  listTeams,
  getTeam,
  updateTeam,
  setTeamPhoto,
  deleteTeamPhoto,
  listCandidates,
  addMember,
  confirmMember,
  updateMemberDetails,
  removeMember,
  callUpPlayer,
} = require('../controllers/teamsController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');
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

// Öffentlich: wird im Registrierungsformular benötigt (noch kein Login).
router.get('/', listTeams);

// Ab hier: angemeldet, mit gültiger Rolle (checkRole liest sie frisch aus der DB).
const requireAuth = [authenticate, checkRole(ROLES)];

router.get('/:code', requireAuth, getTeam);

// Stammdaten der Mannschaft (nuLiga-Nummer, Mannschaftsfoto). Die
// Rollenprüfung auf admin/sub_admin macht der Controller – hier steht nur die
// allgemeine Anmeldepflicht.
router.patch('/:code', requireAuth, updateTeam);
// Reihenfolge beachtet: erst bremsen, dann anmelden, DANN erst die Datei
// entgegennehmen – so landet eine abgelehnte Anfrage gar nicht erst auf der
// Platte.
router.post('/:code/photo', photoLimiter, requireAuth, uploadTeamPhoto, setTeamPhoto);
router.delete('/:code/photo', requireAuth, deleteTeamPhoto);

router.get('/:code/candidates', requireAuth, listCandidates);
router.post('/:code/members', requireAuth, addMember);
router.post('/:code/members/:userId/confirm', requireAuth, confirmMember);
// Kaderangaben: Rückennummer, Position, Bezeichnung im Betreuerstab.
router.patch('/:code/members/:userId', requireAuth, updateMemberDetails);
router.delete('/:code/members/:userId', requireAuth, removeMember);
router.post('/:code/callup', requireAuth, callUpPlayer);

module.exports = router;
