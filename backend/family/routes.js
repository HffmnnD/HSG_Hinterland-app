// /api/family – Eltern-Kind-Verknüpfung.
//
//   GET    /                       eigene Kinder und Eltern
//   POST   /code                   Code erzeugen, mit dem Eltern dieses Konto verknüpfen
//   POST   /link       { code }    als Elternteil ein Kind per Code verknüpfen
//   POST   /children   { firstName, lastName, teamIds? }  Kinderprofil ohne Login anlegen
//   DELETE /children/:id           Verknüpfung zum eigenen Kind lösen
//   POST   /children/:id/invite    Einladungscode: Kind übernimmt das Profil als eigenes Konto
//   DELETE /children/:id/invite    Einladungscode zurückziehen
//
//   Öffentlich (ohne Anmeldung, siehe publicRouter):
//   POST   /invite/check { code }  Vorname zum Einladungscode (Registrierung)
//
//   Verwaltung (family.manage):
//   GET    /users/:id              Kinder und Eltern einer Person
//   POST   /admin/link   { parentId, childId }
//   DELETE /admin/link   { parentId, childId }
//
// Was Eltern im Kinderkonto dürfen, regelt authMiddleware (Header X-Act-As):
// alles, was das Kind selbst darf – außer Passwort, Verwaltung und Familie.
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

const {
  authenticate,
  requirePermission,
  forbidWhileActingAs,
} = require('../middleware/authMiddleware');
const { SALT_ROUNDS } = require('../config/auth');
const accessService = require('../access/service');
const { parseId, validateSelfRelations } = require('../utils/validation');
const userRepository = require('../repositories/userRepository');
const appEvents = require('../services/appEvents');
const repository = require('./repository');

const router = express.Router();
const publicRouter = express.Router();

const CODE_HOURS = 48;
// Der Einladungscode wird oft erst Tage später benutzt (Kind bekommt ein Handy).
const INVITE_DAYS = 14;
// Ohne leicht verwechselbare Zeichen (0/O, 1/I/L) – wird abgetippt.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_CHILDREN = 10;

const perUser = (req) => `user:${req.userId}`;

// Bremst das Raten von Codes: 31^8 Möglichkeiten, 10 Versuche je Viertelstunde.
const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Änderungen. Bitte kurz warten.' },
});

// Öffentliche Prüfung eines Einladungscodes – je IP gebremst.
const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' },
});

publicRouter.post('/invite/check', checkLimiter, async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.code);
    if (code.length !== CODE_LENGTH) {
      return res.status(400).json({ message: 'Bitte den 8-stelligen Code eingeben.' });
    }
    const invite = await repository.peekInvite(code);
    if (!invite) return res.status(404).json({ message: 'Der Code ist ungültig oder abgelaufen.' });
    // Nur der Name – zum Wiedererkennen und Vorausfüllen.
    return res.json({ firstName: invite.firstName, lastName: invite.lastName });
  } catch (err) {
    return next(err);
  }
});

router.use(authenticate);

function newCode() {
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

const normalizeCode = (value) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) : '';

const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

const cleanName = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 100) : '';

// Bei Änderungen am Kinder-Bestand den Rechte-Cache des Elternteils verwerfen:
// dort steht, als wen es handeln darf.
const refresh = (...ids) => ids.forEach((id) => accessService.invalidate(id));

router.get('/', async (req, res, next) => {
  try {
    // Im Kinderkonto zeigt die Liste trotzdem die Kinder des Elternteils –
    // sonst fände man den Weg zurück bzw. zum Geschwisterkind nicht.
    const ownId = req.actorId ?? req.userId;
    const [children, parents] = await Promise.all([
      repository.listChildren(ownId),
      repository.listParents(ownId),
    ]);
    res.json({ children, parents });
  } catch (err) {
    next(err);
  }
});

router.post('/code', forbidWhileActingAs, writeLimiter, async (req, res, next) => {
  try {
    const code = newCode();
    await repository.saveCode(req.userId, code, CODE_HOURS);
    res.json({
      code: formatCode(code),
      validHours: CODE_HOURS,
      message: `Code erstellt. Er gilt ${CODE_HOURS} Stunden und nur einmal.`,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/link', forbidWhileActingAs, linkLimiter, async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.code);
    if (code.length !== CODE_LENGTH) {
      return res.status(400).json({ message: 'Bitte den 8-stelligen Code eingeben.' });
    }
    const childId = await repository.consumeCode(code);
    if (!childId) return res.status(404).json({ message: 'Der Code ist ungültig oder abgelaufen.' });
    if (childId === req.userId) {
      return res.status(400).json({ message: 'Du kannst dich nicht mit dir selbst verknüpfen.' });
    }
    // Kein Kreis: Wer selbst Elternteil der anfragenden Person ist, wird nicht ihr Kind.
    if (await repository.isLinked(childId, req.userId)) {
      return res.status(400).json({ message: 'Diese Person ist bereits als Elternteil mit dir verknüpft.' });
    }
    const children = await repository.listChildren(req.userId);
    if (children.length >= MAX_CHILDREN) {
      return res.status(400).json({ message: 'Es sind bereits zu viele Kinder verknüpft.' });
    }
    await repository.link(req.userId, childId, req.userId);
    refresh(req.userId);
    const child = await repository.findPerson(childId);
    return res.status(201).json({
      message: `${child.firstName} ist jetzt mit deinem Konto verknüpft.`,
      children: await repository.listChildren(req.userId),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/children', forbidWhileActingAs, writeLimiter, async (req, res, next) => {
  try {
    const firstName = cleanName(req.body?.firstName);
    const lastName = cleanName(req.body?.lastName);
    if (firstName.length < 1 || lastName.length < 1) {
      return res.status(400).json({ message: 'Bitte Vor- und Nachnamen angeben.' });
    }
    // Optional gleich die Mannschaften des Kindes (als Spieler:in-Anfrage,
    // die das Trainerteam bestätigt – wie bei jeder Selbst-Anmeldung).
    const teamIds = Array.isArray(req.body?.teamIds) ? req.body.teamIds.slice(0, 20) : [];
    const teamCheck = await validateSelfRelations(teamIds.map((teamId) => ({ teamId, relationType: 'player' })));
    if (!teamCheck.ok) return res.status(teamCheck.status).json({ message: teamCheck.message });

    const children = await repository.listChildren(req.userId);
    if (children.length >= MAX_CHILDREN) {
      return res.status(400).json({ message: 'Es sind bereits zu viele Kinder verknüpft.' });
    }
    // Zufälliges Passwort, das niemand kennt – der Login ist ohnehin gesperrt.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);
    const childId = await repository.createManagedChild({ firstName, lastName }, passwordHash);
    await repository.link(req.userId, childId, req.userId);
    if (teamCheck.relations.length > 0) {
      await userRepository.updateOwnPreferences(childId, { relations: teamCheck.relations });
      appEvents.publish('membership.changed', { userId: childId });
    }
    refresh(req.userId);
    return res.status(201).json({
      message:
        teamCheck.relations.length > 0
          ? `Profil für ${firstName} angelegt. Die Mannschaftsanfrage bestätigt noch das Trainerteam.`
          : `Profil für ${firstName} angelegt. Wechsle zu ${firstName}, um Mannschaften zu wählen.`,
      childId,
      children: await repository.listChildren(req.userId),
    });
  } catch (err) {
    return next(err);
  }
});

router.delete('/children/:id', forbidWhileActingAs, writeLimiter, async (req, res, next) => {
  try {
    const childId = parseId(req.params.id);
    if (!childId) return res.status(400).json({ message: 'Ungültige ID.' });
    const child = await repository.findPerson(childId);
    if (child?.isManaged && (await repository.countParents(childId)) <= 1) {
      return res.status(409).json({
        message: 'Dieses Kinderprofil hat keinen eigenen Login. Bitte zuerst ein zweites Elternteil verknüpfen oder die Verwaltung um Löschung bitten.',
      });
    }
    if (!(await repository.unlink(req.userId, childId))) {
      return res.status(404).json({ message: 'Verknüpfung nicht gefunden.' });
    }
    refresh(req.userId);
    return res.json({ message: 'Verknüpfung gelöst.', children: await repository.listChildren(req.userId) });
  } catch (err) {
    return next(err);
  }
});

// Einladungscode für ein Kinderprofil: Das Kind registriert sich damit und
// übernimmt das Profil – Eltern bleiben verknüpft und können weiter handeln.
router.post('/children/:id/invite', forbidWhileActingAs, writeLimiter, async (req, res, next) => {
  try {
    const childId = parseId(req.params.id);
    if (!childId || !(await repository.isLinked(req.userId, childId))) {
      return res.status(404).json({ message: 'Verknüpfung nicht gefunden.' });
    }
    const child = await repository.findPerson(childId);
    if (!child?.isManaged) {
      return res.status(400).json({ message: `${child?.firstName ?? 'Dein Kind'} hat bereits ein eigenes Konto.` });
    }
    const code = newCode();
    await repository.saveInvite(childId, code, INVITE_DAYS, req.userId);
    return res.json({
      code: formatCode(code),
      validDays: INVITE_DAYS,
      message: `Code für ${child.firstName} erstellt. Er gilt ${INVITE_DAYS} Tage und nur einmal.`,
      children: await repository.listChildren(req.userId),
    });
  } catch (err) {
    return next(err);
  }
});

router.delete('/children/:id/invite', forbidWhileActingAs, writeLimiter, async (req, res, next) => {
  try {
    const childId = parseId(req.params.id);
    if (!childId || !(await repository.isLinked(req.userId, childId))) {
      return res.status(404).json({ message: 'Verknüpfung nicht gefunden.' });
    }
    await repository.deleteInvite(childId);
    return res.json({ message: 'Code zurückgezogen.', children: await repository.listChildren(req.userId) });
  } catch (err) {
    return next(err);
  }
});

// --- Verwaltung -------------------------------------------------------------

const admin = [forbidWhileActingAs, requirePermission('family.manage', 'members.view')];

router.get('/users/:id', admin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Ungültige ID.' });
    const [children, parents] = await Promise.all([repository.listChildren(id), repository.listParents(id)]);
    return res.json({ children, parents });
  } catch (err) {
    return next(err);
  }
});

async function readPair(req, res) {
  const parentId = parseId(req.body?.parentId);
  const childId = parseId(req.body?.childId);
  if (!parentId || !childId || parentId === childId) {
    res.status(400).json({ message: 'Bitte Elternteil und Kind angeben.' });
    return null;
  }
  const [parent, child] = await Promise.all([repository.findPerson(parentId), repository.findPerson(childId)]);
  if (!parent || !child) {
    res.status(404).json({ message: 'Mitglied nicht gefunden.' });
    return null;
  }
  return { parentId, childId, parent, child };
}

router.post('/admin/link', forbidWhileActingAs, requirePermission('family.manage'), writeLimiter, async (req, res, next) => {
  try {
    const pair = await readPair(req, res);
    if (!pair) return undefined;
    if (await repository.isLinked(pair.childId, pair.parentId)) {
      return res.status(400).json({ message: 'Die beiden sind bereits umgekehrt verknüpft.' });
    }
    await repository.link(pair.parentId, pair.childId, req.userId);
    refresh(pair.parentId);
    return res.status(201).json({
      message: `${pair.parent.firstName} ist jetzt Elternteil von ${pair.child.firstName}.`,
    });
  } catch (err) {
    return next(err);
  }
});

router.delete('/admin/link', forbidWhileActingAs, requirePermission('family.manage'), writeLimiter, async (req, res, next) => {
  try {
    const pair = await readPair(req, res);
    if (!pair) return undefined;
    if (!(await repository.unlink(pair.parentId, pair.childId))) {
      return res.status(404).json({ message: 'Verknüpfung nicht gefunden.' });
    }
    refresh(pair.parentId);
    return res.json({ message: 'Verknüpfung gelöst.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
module.exports.normalizeCode = normalizeCode;
module.exports.CODE_LENGTH = CODE_LENGTH;
