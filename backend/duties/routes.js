// HTTP-Schnittstelle des Dienstplans (/api/duties/*).
//
// Alle Angemeldeten:
//   GET    /                       veröffentlichte Dienste (?from, ?to)
//   POST   /:id/claim              Dienst übernehmen  { clientTime }
//   (Austragen geht nur über die Vereinsleitung, siehe unten.)
//
// Nur Admin und Sub-Admin:
//   GET    /plans                  alle Pläne inkl. Entwürfe (?past=1)
//   GET    /plans/:id              ein Plan mit allen Diensten
//   POST   /plans                  anlegen { title, location, notes, duties[], publish, notify }
//   PATCH  /plans/:id              Stammdaten ändern
//   POST   /plans/:id/publish      veröffentlichen { notify }
//   DELETE /plans/:id              löschen
//   GET    /settings               Vereinseinstellung Namen { assignees }
//   PATCH  /settings               { assignees: 'all' | 'admins' }
//   POST   /plans/:id/duties       weitere Dienste { duties[], notify }
//   PATCH  /:id                    Dienst ändern
//   DELETE /:id                    Dienst löschen
//   DELETE /:id/assignments/:userId  Person austragen
const express = require('express');
const rateLimit = require('express-rate-limit');

const { authenticate, requirePermission } = require('../middleware/authMiddleware');
const { can } = require('../access/service');
const { validateRange } = require('../utils/scheduleValidation');
const { nowSqlDateTime } = require('../utils/schedule');
const categories = require('./categories');
const config = require('./config');
const repository = require('./repository');
const service = require('./service');
const settings = require('../settings');
const {
  parseId,
  validatePlanFields,
  validateDuty,
  validateDutyList,
  parseClientTime,
} = require('./validation');

const router = express.Router();

const requireAuth = [authenticate];
const requireAdmin = [authenticate, requirePermission('duties.manage')];
const requireSettings = [authenticate, requirePermission('settings.manage', 'duties.manage')];

// Je Konto, nicht je IP: Im Vereinsheim-WLAN teilen sich viele eine Adresse.
const perUser = (req) => `user:${req.userId}`;

const claimLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Versuche. Bitte kurz warten.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Änderungen. Bitte in einigen Minuten erneut versuchen.' },
});

const send = (res, outcome, extra = {}) =>
  res.status(outcome.status).json({ message: outcome.message, code: outcome.code, ...extra });

/** Wer schaut? Rolle und Helferdienste für categories.canTake. */
async function loadViewer(req) {
  const person = (await repository.findPerson(req.userId)) ?? { id: req.userId, role: req.userRole, services: [] };
  return { ...person, canManage: can(req, 'duties.manage') };
}

/** Darf `viewer` die Namen der Eingetragenen sehen? (Vereinseinstellung) */
async function showNamesFor(viewer) {
  return service.isAdmin(viewer) || (await settings.get('dutyAssignees')) === 'all';
}

/** Dienste -> Pläne mit aufbereiteten Diensten, nach erstem Dienst sortiert. */
async function presentPlans(duties, plans, viewer) {
  const showNames = await showNamesFor(viewer);
  const assignments = await repository.listAssignments(duties.map((duty) => duty.id));
  const byDuty = new Map();
  for (const entry of assignments) {
    if (!byDuty.has(entry.dutyId)) byDuty.set(entry.dutyId, []);
    byDuty.get(entry.dutyId).push(entry);
  }
  const nowSql = nowSqlDateTime();
  const byPlan = new Map(plans.map((plan) => [plan.id, { ...plan, duties: [] }]));
  for (const duty of duties) {
    byPlan.get(duty.planId)?.duties.push(
      service.presentDuty(duty, byDuty.get(duty.id) ?? [], viewer, nowSql, { showNames })
    );
  }
  return [...byPlan.values()].sort((a, b) =>
    String(a.duties[0]?.startTime ?? '').localeCompare(String(b.duties[0]?.startTime ?? ''))
  );
}

/** Aktueller Stand eines Dienstes aus Sicht des Aufrufers (nach Zusage o. Ä.). */
async function presentOne(dutyId, viewer) {
  const duty = await repository.findDuty(dutyId);
  if (!duty) return null;
  const assignments = await repository.listAssignments([dutyId]);
  return service.presentDuty(duty, assignments, viewer, nowSqlDateTime(), {
    showNames: await showNamesFor(viewer),
  });
}

const meta = () => ({
  categories: categories.list(),
  maxCapacity: config.MAX_CAPACITY,
  maxPerRequest: config.MAX_DUTIES_PER_REQUEST,
});

// --- Alle Angemeldeten -------------------------------------------------------

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const range = validateRange(req.query);
    if (!range.ok) return res.status(range.status).json({ message: range.message });

    const fromSql = range.from ? `${range.from} 00:00:00` : nowSqlDateTime();
    const toSql = range.to ? `${range.to} 23:59:59` : null;

    const duties = await repository.listPublishedDuties(fromSql, toSql);
    const plans = await repository.findPlansByIds([...new Set(duties.map((d) => d.planId))]);
    const viewer = await loadViewer(req);
    return res.json({
      plans: await presentPlans(duties, plans, viewer),
      showNames: await showNamesFor(viewer),
      ...meta(),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/claim', requireAuth, claimLimiter, async (req, res, next) => {
  try {
    const dutyId = parseId(req.params.id);
    if (!dutyId) return res.status(400).json({ message: 'Ungültige Dienst-ID.' });

    const outcome = await service.claim(req.userId, dutyId, parseClientTime(req.body?.clientTime));
    const duty = outcome.status === 404 ? null : await presentOne(dutyId, await loadViewer(req));
    return send(res, outcome, { duty });
  } catch (err) {
    return next(err);
  }
});

// --- Verwaltung --------------------------------------------------------------

// Vereinsweit: Wer sieht die Namen der Eingetragenen? 'all' | 'admins'
router.get('/settings', requireSettings, async (req, res, next) => {
  try {
    return res.json({ assignees: await settings.get('dutyAssignees') });
  } catch (err) {
    return next(err);
  }
});

router.patch('/settings', requireSettings, adminLimiter, async (req, res, next) => {
  try {
    const result = await settings.set('dutyAssignees', req.body?.assignees, req.userId);
    if (!result.ok) return res.status(400).json({ message: result.message });
    return res.json({ message: 'Gespeichert.', assignees: req.body.assignees });
  } catch (err) {
    return next(err);
  }
});

router.get('/plans', requireAdmin, async (req, res, next) => {
  try {
    const plans = await repository.listPlanSummaries({
      includePast: req.query.past === '1' || req.query.past === 'true',
      nowSql: nowSqlDateTime(),
    });
    return res.json({ plans, ...meta() });
  } catch (err) {
    return next(err);
  }
});

router.get('/plans/:id', requireAdmin, async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    if (!planId) return res.status(400).json({ message: 'Ungültige Plan-ID.' });
    const plan = await repository.findPlan(planId);
    if (!plan) return res.status(404).json({ message: 'Dienstplan nicht gefunden.' });

    const duties = await repository.listPlanDuties(planId);
    const [presented] = await presentPlans(duties, [plan], await loadViewer(req));
    return res.json({ plan: presented, ...meta() });
  } catch (err) {
    return next(err);
  }
});

router.post('/plans', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const planCheck = validatePlanFields(req.body);
    if (!planCheck.ok) return res.status(planCheck.status).json({ message: planCheck.message });
    const dutyCheck = validateDutyList(req.body.duties);
    if (!dutyCheck.ok) return res.status(dutyCheck.status).json({ message: dutyCheck.message });

    const planId = await service.createPlan(req.userId, planCheck.fields, dutyCheck.duties, {
      publish: req.body.publish === true,
      notify: req.body.notify === true,
    });
    return res.status(201).json({
      message: req.body.publish === true ? 'Dienstplan veröffentlicht.' : 'Entwurf gespeichert.',
      planId,
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/plans/:id', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    if (!planId) return res.status(400).json({ message: 'Ungültige Plan-ID.' });
    const check = validatePlanFields(req.body, { partial: true });
    if (!check.ok) return res.status(check.status).json({ message: check.message });

    if (!(await repository.findPlan(planId))) {
      return res.status(404).json({ message: 'Dienstplan nicht gefunden.' });
    }
    await repository.updatePlan(planId, check.fields);
    return res.json({ message: 'Gespeichert.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/plans/:id/publish', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    if (!planId) return res.status(400).json({ message: 'Ungültige Plan-ID.' });
    return send(res, await service.publishPlan(req.userId, planId, { notify: req.body?.notify === true }));
  } catch (err) {
    return next(err);
  }
});

router.delete('/plans/:id', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    if (!planId) return res.status(400).json({ message: 'Ungültige Plan-ID.' });
    return send(res, await service.deletePlan(req.userId, planId));
  } catch (err) {
    return next(err);
  }
});

router.post('/plans/:id/duties', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const planId = parseId(req.params.id);
    if (!planId) return res.status(400).json({ message: 'Ungültige Plan-ID.' });
    const check = validateDutyList(req.body?.duties);
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    return send(
      res,
      await service.addDuties(req.userId, planId, check.duties, { notify: req.body?.notify === true })
    );
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const dutyId = parseId(req.params.id);
    if (!dutyId) return res.status(400).json({ message: 'Ungültige Dienst-ID.' });
    return send(
      res,
      await service.updateDuty(req.userId, dutyId, (existing) =>
        validateDuty(req.body, { existing })
      )
    );
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const dutyId = parseId(req.params.id);
    if (!dutyId) return res.status(400).json({ message: 'Ungültige Dienst-ID.' });
    return send(res, await service.deleteDuty(req.userId, dutyId));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id/assignments/:userId', requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const dutyId = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    if (!dutyId || !userId) return res.status(400).json({ message: 'Ungültige ID.' });
    return send(res, await service.unassign(req.userId, dutyId, userId));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
