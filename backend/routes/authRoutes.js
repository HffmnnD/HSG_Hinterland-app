const express = require('express');

const { register, login, logout, me } = require('../controllers/authController');
const authenticate = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;
