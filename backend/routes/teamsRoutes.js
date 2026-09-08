const express = require('express');

const {
  listTeams,
  getTeam,
  listCandidates,
  addMember,
  confirmMember,
  removeMember,
  callUpPlayer,
} = require('../controllers/teamsController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Öffentlich: wird im Registrierungsformular benötigt (noch kein Login).
router.get('/', listTeams);

// Ab hier: angemeldet, mit gültiger Rolle (checkRole liest sie frisch aus der DB).
const requireAuth = [authenticate, checkRole(ROLES)];

router.get('/:code', requireAuth, getTeam);
router.get('/:code/candidates', requireAuth, listCandidates);
router.post('/:code/members', requireAuth, addMember);
router.post('/:code/members/:userId/confirm', requireAuth, confirmMember);
router.delete('/:code/members/:userId', requireAuth, removeMember);
router.post('/:code/callup', requireAuth, callUpPlayer);

module.exports = router;
