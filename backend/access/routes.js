// /api/access – Rollen und Einzelrechte.
//
//   GET    /catalog            alle Rechte, gruppiert (für den Editor)
//   GET    /roles              alle Rollen mit Rechten
//   POST   /roles              Rolle anlegen                 (access.manage)
//   PATCH  /roles/:id          Rolle ändern                  (access.manage)
//   DELETE /roles/:id          Vereinsrolle löschen          (access.manage)
//   GET    /users/:id          Zusatzrollen, Einzelrechte und wirksame Rechte
//   PUT    /users/:id          Zusatzrollen (members.roles) / Einzelrechte (access.manage)
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  authenticate,
  requirePermission,
  forbidWhileActingAs,
} = require('../middleware/authMiddleware');
const { GROUPS, PERMISSIONS, isPermission } = require('./permissions');
const repository = require('./repository');
const service = require('./service');
const rules = require('./rules');
const { parseId } = require('../utils/validation');

const router = express.Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Änderungen. Bitte in einigen Minuten erneut versuchen.' },
});

router.use(authenticate, forbidWhileActingAs);

const canSeeAccess = requirePermission('members.view', 'access.manage', 'members.roles');
const canManage = requirePermission('access.manage');

const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : undefined;

/** Rechte-Liste prüfen: nur bekannte Schlüssel, keine Doppelten. */
function readPermissions(value) {
  if (!Array.isArray(value)) return { ok: false, message: 'permissions muss eine Liste sein.' };
  const unique = [...new Set(value)];
  if (!unique.every(isPermission)) return { ok: false, message: 'Unbekanntes Recht in der Liste.' };
  return { ok: true, permissions: unique };
}

router.get('/catalog', canSeeAccess, (req, res) => {
  res.json({ groups: GROUPS, permissions: PERMISSIONS });
});

router.get('/roles', canSeeAccess, async (req, res, next) => {
  try {
    const roles = await repository.listRoles();
    res.json({
      roles: roles.map((role) => ({ ...role, assignable: rules.canAssignRole(req.access, role) })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/roles', canManage, writeLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 60);
    if (!name || name.length < 2) return res.status(400).json({ message: 'Bitte einen Namen angeben.' });
    const description = cleanText(req.body?.description, 255) || null;
    const perms = readPermissions(req.body?.permissions ?? []);
    if (!perms.ok) return res.status(400).json({ message: perms.message });
    if (!perms.permissions.every((perm) => rules.canGrant(req.access, perm))) {
      return res.status(403).json({ message: 'Du kannst nur Rechte bündeln, die du selbst hast.' });
    }

    const key =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30) || 'rolle';
    const roleKey = /^[a-z]/.test(key) ? key : `r_${key}`;

    try {
      const id = await repository.createRole({
        key: roleKey,
        name,
        description,
        permissions: perms.permissions,
      });
      return res.status(201).json({ message: `Rolle „${name}“ angelegt.`, role: await repository.findRole(id) });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Eine Rolle mit diesem Namen gibt es schon.' });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
});

router.patch('/roles/:id', canManage, writeLimiter, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const role = id && (await repository.findRole(id));
    if (!role) return res.status(404).json({ message: 'Rolle nicht gefunden.' });
    if (!rules.canAssignRole(req.access, role)) {
      return res.status(403).json({ message: 'Diese Rolle hat mehr Rechte als du – ändern kann sie nur ein Admin.' });
    }

    const patch = {};
    if (req.body?.name !== undefined) {
      const name = cleanText(req.body.name, 60);
      if (!name || name.length < 2) return res.status(400).json({ message: 'Bitte einen Namen angeben.' });
      patch.name = name;
    }
    if (req.body?.description !== undefined) {
      patch.description = cleanText(req.body.description, 255) || null;
    } else {
      patch.description = role.description;
    }
    if (req.body?.permissions !== undefined) {
      if (role.isSuperuser) {
        return res.status(400).json({ message: 'Die Admin-Rolle hat immer alle Rechte.' });
      }
      const perms = readPermissions(req.body.permissions);
      if (!perms.ok) return res.status(400).json({ message: perms.message });
      // Wer nicht alles hat, darf nur innerhalb der eigenen Rechte verschieben.
      const touched = [
        ...perms.permissions.filter((p) => !role.permissions.includes(p)),
        ...role.permissions.filter((p) => !perms.permissions.includes(p)),
      ];
      if (!touched.every((perm) => rules.canGrant(req.access, perm))) {
        return res.status(403).json({ message: 'Du kannst nur Rechte ändern, die du selbst hast.' });
      }
      patch.permissions = perms.permissions;
    }

    await repository.updateRole(id, patch);
    service.invalidate();
    return res.json({ message: 'Rolle gespeichert.', role: await repository.findRole(id) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/roles/:id', canManage, writeLimiter, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const role = id && (await repository.findRole(id));
    if (!role) return res.status(404).json({ message: 'Rolle nicht gefunden.' });
    if (role.isSystem) return res.status(400).json({ message: 'Systemrollen lassen sich nicht löschen.' });
    if (!rules.canAssignRole(req.access, role)) {
      return res.status(403).json({ message: 'Diese Rolle kannst du nicht löschen.' });
    }
    await repository.deleteRole(id);
    service.invalidate();
    return res.json({ message: `Rolle „${role.name}“ gelöscht.` });
  } catch (err) {
    return next(err);
  }
});

router.get('/users/:id', canSeeAccess, async (req, res, next) => {
  try {
    const userId = parseId(req.params.id);
    const target = userId && (await service.getAccess(userId));
    if (!target) return res.status(404).json({ message: 'Mitglied nicht gefunden.' });
    const grants = await repository.getUserGrants(userId);
    return res.json({
      userId,
      role: target.role,
      ...grants,
      isSuperuser: target.isSuperuser,
      permissions: [...target.permissions],
      editable: userId !== req.userId && rules.canTouchTarget(req.access, target),
    });
  } catch (err) {
    return next(err);
  }
});

router.put(
  '/users/:id',
  requirePermission('members.roles', 'access.manage'),
  writeLimiter,
  async (req, res, next) => {
    try {
      const userId = parseId(req.params.id);
      const target = userId && (await service.getAccess(userId));
      if (!target) return res.status(404).json({ message: 'Mitglied nicht gefunden.' });
      if (userId === req.userId) {
        return res.status(400).json({ message: 'Die eigenen Rechte ändert ein anderer Admin.' });
      }
      if (!rules.canTouchTarget(req.access, target)) {
        return res.status(403).json({ message: 'Admin-Konten bearbeitet nur ein Admin.' });
      }

      const { extraRoles, overrides } = req.body || {};
      const current = await repository.getUserGrants(userId);
      let nextRoles = null;
      let nextOverrides = null;

      if (extraRoles !== undefined) {
        if (!service.can(req, 'members.roles') && !req.access.isSuperuser) {
          return res.status(403).json({ message: 'Dir fehlt das Recht „Rollen zuweisen“.' });
        }
        if (!Array.isArray(extraRoles) || extraRoles.length > 20) {
          return res.status(400).json({ message: 'extraRoles muss eine Liste sein.' });
        }
        const keys = [...new Set(extraRoles.filter((k) => typeof k === 'string'))].filter(
          (key) => key !== target.role
        );
        const found = await repository.findRolesByKeys(keys);
        if (found.length !== keys.length) {
          return res.status(400).json({ message: 'Unbekannte Rolle in der Liste.' });
        }
        // Geprüft wird jede Rolle, die dazukommt ODER wegfällt.
        const changed = [
          ...keys.filter((k) => !current.extraRoles.includes(k)),
          ...current.extraRoles.filter((k) => !keys.includes(k)),
        ];
        const changedRoles = await repository.findRolesByKeys(changed);
        if (!changedRoles.every((role) => rules.canAssignRole(req.access, role))) {
          return res.status(403).json({ message: 'Du kannst nur Rollen vergeben, deren Rechte du selbst hast.' });
        }
        nextRoles = found;
      }

      if (overrides !== undefined) {
        if (!service.can(req, 'access.manage')) {
          return res.status(403).json({ message: 'Dir fehlt das Recht „Rechte verwalten“.' });
        }
        if (!Array.isArray(overrides) || overrides.length > 100) {
          return res.status(400).json({ message: 'overrides muss eine Liste sein.' });
        }
        const seen = new Set();
        const clean = [];
        for (const entry of overrides) {
          if (!entry || !isPermission(entry.permission) || !['grant', 'deny'].includes(entry.effect)) {
            return res.status(400).json({ message: 'Ungültiger Eintrag bei den Einzelrechten.' });
          }
          if (seen.has(entry.permission)) continue;
          seen.add(entry.permission);
          clean.push({ permission: entry.permission, effect: entry.effect });
        }
        const before = new Map(current.overrides.map((o) => [o.permission, o.effect]));
        const after = new Map(clean.map((o) => [o.permission, o.effect]));
        const touched = [...new Set([...before.keys(), ...after.keys()])].filter(
          (perm) => before.get(perm) !== after.get(perm)
        );
        if (!touched.every((perm) => rules.canGrant(req.access, perm))) {
          return res.status(403).json({ message: 'Du kannst nur Rechte vergeben oder entziehen, die du selbst hast.' });
        }
        nextOverrides = clean;
      }

      // Letzter Admin? Zusatzrollen mit Superuser dürfen nicht wegfallen, wenn
      // sonst niemand mehr übrig ist.
      if (nextRoles && target.isSuperuser) {
        const [primary] = await repository.findRolesByKeys([target.role]);
        const staysSuper = primary?.isSuperuser || nextRoles.some((role) => role.isSuperuser);
        if (!staysSuper && (await rules.wouldLoseLastSuperuser(target))) {
          return res.status(409).json({ message: 'Der letzte aktive Admin kann seine Admin-Rolle nicht verlieren.' });
        }
      }

      if (nextRoles) await repository.setUserExtraRoles(userId, nextRoles.map((r) => r.id), req.userId);
      if (nextOverrides) await repository.setUserOverrides(userId, nextOverrides, req.userId);
      service.invalidate(userId);

      const fresh = await service.getAccess(userId);
      return res.json({
        message: 'Rechte gespeichert.',
        userId,
        role: fresh.role,
        ...(await repository.getUserGrants(userId)),
        isSuperuser: fresh.isSuperuser,
        permissions: [...fresh.permissions],
        editable: true,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
