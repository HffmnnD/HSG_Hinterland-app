// Persönliche Einstellungen, die nur die eigene Ansicht betreffen
// (Migration 021):
//
//   PUT    /api/me/favorites/:teamId   Mannschaft als Favorit merken
//   DELETE /api/me/favorites/:teamId   Favorit entfernen
//   PUT    /api/me/home                Startseite: { order:[…], hidden:[…] }
//
// Beides steht im Profil (/api/auth/me) als favoriteTeamIds und homeLayout.
const express = require('express');

const pool = require('../config/db');
const { authenticate } = require('../middleware/authMiddleware');
const { parseId } = require('../utils/validation');

// Kacheln der Startseite. Neue Kachel = neuer Schlüssel hier und im Frontend
// (components/home/widgets.js).
const HOME_WIDGETS = ['family', 'next', 'calendar', 'clubEvents', 'duties', 'teams', 'live'];

function parseLayout(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return sanitizeLayout(value);
  } catch {
    return null;
  }
}

function sanitizeLayout(value) {
  if (!value || typeof value !== 'object') return null;
  const pick = (list) =>
    Array.isArray(list) ? [...new Set(list.filter((key) => HOME_WIDGETS.includes(key)))] : [];
  return { order: pick(value.order), hidden: pick(value.hidden) };
}

/** Für userRepository.buildProfile. Ohne Migration 021: Standard. */
async function loadPersonal(userId) {
  try {
    const [[row]] = await pool.query('SELECT home_layout FROM users WHERE id = ?', [userId]);
    const [favorites] = await pool.query(
      'SELECT team_id FROM team_favorites WHERE user_id = ? ORDER BY created_at',
      [userId]
    );
    return {
      homeLayout: parseLayout(row?.home_layout),
      favoriteTeamIds: favorites.map((f) => f.team_id),
    };
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
      return { homeLayout: null, favoriteTeamIds: [] };
    }
    throw err;
  }
}

const router = express.Router();
router.use(authenticate);

router.put('/favorites/:teamId', async (req, res, next) => {
  try {
    const teamId = parseId(req.params.teamId);
    if (!teamId) return res.status(400).json({ message: 'Ungültige Mannschaft.' });
    const [[team]] = await pool.query('SELECT id FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ message: 'Mannschaft nicht gefunden.' });
    await pool.query('INSERT IGNORE INTO team_favorites (user_id, team_id) VALUES (?, ?)', [req.userId, teamId]);
    return res.json({ message: 'Zu den Favoriten hinzugefügt.', ...(await loadPersonal(req.userId)) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/favorites/:teamId', async (req, res, next) => {
  try {
    const teamId = parseId(req.params.teamId);
    if (!teamId) return res.status(400).json({ message: 'Ungültige Mannschaft.' });
    await pool.query('DELETE FROM team_favorites WHERE user_id = ? AND team_id = ?', [req.userId, teamId]);
    return res.json({ message: 'Aus den Favoriten entfernt.', ...(await loadPersonal(req.userId)) });
  } catch (err) {
    return next(err);
  }
});

router.put('/home', async (req, res, next) => {
  try {
    const layout = sanitizeLayout(req.body);
    if (!layout) return res.status(400).json({ message: 'Ungültiger Aufbau.' });
    await pool.query('UPDATE users SET home_layout = ? WHERE id = ?', [JSON.stringify(layout), req.userId]);
    return res.json({ message: 'Startseite gespeichert.', homeLayout: layout });
  } catch (err) {
    return next(err);
  }
});

function mount(app) {
  app.use('/api/me', router);
}

module.exports = { mount, loadPersonal, HOME_WIDGETS };
