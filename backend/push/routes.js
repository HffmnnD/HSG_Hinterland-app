// HTTP-Schnittstelle des Push-Moduls (/api/push/*).
//
//   GET    /config          Ist Push eingerichtet? + öffentlicher Schlüssel
//   GET    /settings        eigene Einstellungen, Geräteanzahl, Trainer:in?
//   PATCH  /settings        Einstellungen teilweise ändern
//   POST   /subscriptions   dieses Gerät eintragen
//   DELETE /subscriptions   dieses Gerät austragen (auch beim Abmelden)
//   POST   /test            Testnachricht an die eigenen Geräte
const express = require('express');
const rateLimit = require('express-rate-limit');

const { authenticate, checkRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');
const teamRepository = require('../repositories/teamRepository');
const config = require('./config');
const repository = require('./repository');
const preferences = require('./preferences');
const messages = require('./messages');
const { sendToUsers } = require('./sender');

const router = express.Router();
const requireAuth = [authenticate, checkRole(ROLES)];

const testLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Genug getestet – bitte in ein paar Minuten noch mal.' },
});

const NOT_CONFIGURED = 'Push ist auf diesem Server nicht eingerichtet.';

/** Abo aus dem Browser (PushSubscription.toJSON()) prüfen. */
function validateSubscription(body) {
  const endpoint = body?.subscription?.endpoint;
  const keys = body?.subscription?.keys ?? {};
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    endpoint.length > 1000 ||
    !config.ALLOWED_PUSH_HOSTS.some((host) => host.test(url.hostname))
  ) {
    return null;
  }
  const base64url = /^[A-Za-z0-9_-]{8,255}={0,2}$/;
  if (!base64url.test(keys.p256dh ?? '') || !base64url.test(keys.auth ?? '')) {
    return null;
  }
  const label =
    typeof body.deviceLabel === 'string' ? body.deviceLabel.trim().slice(0, 80) : null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth, deviceLabel: label || null };
}

router.get('/config', authenticate, (req, res) => {
  res.json({ enabled: config.enabled, publicKey: config.enabled ? config.publicKey : null });
});

router.get('/settings', requireAuth, async (req, res, next) => {
  try {
    const [stored, devices, teams] = await Promise.all([
      repository.getSettings(req.userId),
      repository.countSubscriptions(req.userId),
      teamRepository.getTeamsForUser(req.userId),
    ]);
    res.json({
      settings: preferences.resolve(stored),
      reminderHours: preferences.REMINDER_HOURS,
      devices,
      isCoach: teams.some((team) => team.relationType === 'coach' && team.isConfirmed),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings', requireAuth, async (req, res, next) => {
  try {
    const check = preferences.validatePatch(req.body);
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    const current = preferences.resolve(await repository.getSettings(req.userId));
    const settings = { ...current, ...check.patch };
    await repository.saveSettings(req.userId, settings);
    return res.json({ message: 'Gespeichert.', settings });
  } catch (err) {
    return next(err);
  }
});

router.post('/subscriptions', requireAuth, async (req, res, next) => {
  try {
    if (!config.enabled) return res.status(503).json({ message: NOT_CONFIGURED });
    const subscription = validateSubscription(req.body);
    if (!subscription) {
      return res.status(400).json({ message: 'Ungültiges Push-Abo.' });
    }
    await repository.saveSubscription(req.userId, subscription);
    return res.status(201).json({ message: 'Benachrichtigungen sind an.' });
  } catch (err) {
    return next(err);
  }
});

// Nur `authenticate`: Auch ein gesperrtes Konto soll sein Gerät austragen
// können.
router.delete('/subscriptions', authenticate, async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 1000) {
      return res.status(400).json({ message: 'Ungültiges Gerät.' });
    }
    await repository.deleteSubscription(req.userId, endpoint);
    return res.json({ message: 'Benachrichtigungen auf diesem Gerät aus.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/test', testLimiter, requireAuth, async (req, res, next) => {
  try {
    if (!config.enabled) return res.status(503).json({ message: NOT_CONFIGURED });
    const delivered = await sendToUsers([req.userId], null, messages.test());
    if (delivered === 0) {
      return res.status(409).json({
        message: 'Kein Gerät erreicht. Schalte Push auf diesem Gerät einmal aus und wieder an.',
      });
    }
    return res.json({
      message: delivered === 1 ? 'Testnachricht ist raus.' : `Testnachricht an ${delivered} Geräte geschickt.`,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
