const express = require('express');

const {
  listTeams,
  getTeam,
  listCandidates,
  addMember,
  removeMember,
  callUpPlayer,
} = require('../controllers/teamsController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Öffentlich: wird im Registrierungsformular benötigt (noch kein Login).
router.get('/', listTeams);

// Ab hier: angemeldet und freigegeben (checkRole prüft beides frisch aus der DB).
const requireApprovedUser = [authenticate, checkRole(ROLES)];

router.get('/:code', requireApprovedUser, getTeam);
router.get('/:code/candidates', requireApprovedUser, listCandidates);
router.post('/:code/members', requireApprovedUser, addMember);
router.delete('/:code/members/:userId', requireApprovedUser, removeMember);
router.post('/:code/callup', requireApprovedUser, callUpPlayer);

module.exports = router;
