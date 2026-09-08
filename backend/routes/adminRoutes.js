const express = require('express');

const { listUsers, updateUser } = require('../controllers/adminController');
const { authenticate, checkRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Alle Admin-Routen: erst Login prüfen, dann Rolle `admin` verlangen.
router.use(authenticate, checkRole('admin'));

router.get('/users', listUsers);
router.patch('/users/:id', updateUser);

module.exports = router;
