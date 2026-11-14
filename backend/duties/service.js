// Fachlogik des Dienstplans: Zusagen, Austragen, Pläne und Dienste ändern.
//
// Alles, was Plätze verteilt, läuft in einer Transaktion mit Zeilensperre auf
// dem Dienst (repository.findDuty mit forUpdate). Kommen hundert Zusagen
// gleichzeitig, reihen sie sich an dieser Sperre auf: Die ersten `capacity`
// bekommen den Platz, alle weiteren sehen „bereits vergeben". Der
// Zeitstempel vom Gerät wird nur gespeichert – Handy-Uhren gehen falsch und
// lassen sich verstellen, darüber darf kein Platz verteilt werden.
const appEvents = require('../services/appEvents');

const { nowSqlDateTime } = require('../utils/schedule');
const categories = require('./categories');
const config = require('./config');
const repository = require('./repository');

const FULL_MESSAGE = 'Dieser Dienst ist bereits vergeben.';
const DUTY_NOT_FOUND = 'Dienst nicht gefunden.';
const PLAN_NOT_FOUND = 'Dienstplan nicht gefunden.';

const result = (status, message, extra = {}) => ({ status, message, ...extra });
const toSql = (iso) => iso.replace('T', ' ');
// Darf verwalten: Recht duties.manage (setzt routes.js am Viewer).
const isAdmin = (who) => Boolean(who && who.canManage);

// Bei Deadlock oder Sperr-Zeitüberschreitung (viele gleichzeitige Zugriffe)
// einfach noch einmal versuchen – die Transaktion ist dann zurückgerollt.
const RETRY_CODES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

async function withRetry(work, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await repository.withTransaction(work);
    } catch (err) {
      if (!RETRY_CODES.has(err.code) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}

// --- Zusagen ----------------------------------------------------------------

/**
 * Dienst übernehmen.
 * @returns {Promise<{status:number, message:string, code?:string}>}
 */
async function claim(userId, dutyId, clientTime) {
  try {
    return await withRetry(async (conn) => {
      // Reihenfolge der Sperren immer: Konto, dann Dienst. Die Konto-Sperre
      // verhindert, dass dieselbe Person zwei sich überschneidende Dienste
      // gleichzeitig bekommt.
      if (!(await repository.lockUser(conn, userId))) {
        return result(401, 'Benutzer nicht gefunden.');
      }
      const duty = await repository.findDuty(dutyId, conn, { forUpdate: true });
      if (!duty || duty.planStatus !== 'published') return result(404, DUTY_NOT_FOUND);
      if (toSql(duty.startTime) <= nowSqlDateTime()) {
        return result(409, 'Dieser Dienst hat schon begonnen.', { code: 'DUTY_STARTED' });
      }

      const person = await repository.findPerson(userId, conn);
      if (!person || !categories.canTake(duty.category, person)) {
        return result(403, 'Diesen Dienst darfst du nicht übernehmen.');
      }
      if (await repository.isAssigned(conn, dutyId, userId)) {
        return result(200, 'Du bist schon eingetragen.', { code: 'ALREADY' });
      }

      const taken = await repository.countTaken(conn, dutyId);
      if (taken >= duty.capacity) {
        return result(409, FULL_MESSAGE, { code: 'DUTY_FULL' });
      }

      const overlap = await repository.findOverlapping(
        conn,
        userId,
        toSql(duty.startTime),
        toSql(duty.endTime),
        dutyId
      );
      if (overlap) {
        return result(409, `Zu der Zeit hast du schon einen Dienst: ${overlap.title}.`, {
          code: 'DUTY_OVERLAP',
        });
      }

      await repository.insertAssignment(conn, { dutyId, userId, clientTime });
      return result(201, 'Eingetragen. Austragen geht nur über die Vereinsleitung.', { code: 'CLAIMED' });
    });
  } catch (err) {
    // Gleiche Person, gleicher Dienst, zweimal im selben Augenblick: Die
    // Konto-Sperre verhindert das eigentlich, der Primärschlüssel ist die
    // letzte Absicherung.
    if (err.code === 'ER_DUP_ENTRY') return result(200, 'Du bist schon eingetragen.', { code: 'ALREADY' });
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
      return result(404, DUTY_NOT_FOUND);
    }
    throw err;
  }
}

/** Admin/Sub-Admin trägt eine Person aus – ohne Frist. */
async function unassign(actorId, dutyId, userId) {
  const outcome = await withRetry(async (conn) => {
    const duty = await repository.findDuty(dutyId, conn, { forUpdate: true });
    if (!duty) return { response: result(404, DUTY_NOT_FOUND) };
    const removed = await repository.deleteAssignment(conn, dutyId, userId);
    if (!removed) return { response: result(404, 'Diese Person ist nicht eingetragen.') };
    return { response: result(200, 'Ausgetragen.'), duty };
  });
  if (outcome.duty && outcome.duty.planStatus === 'published') {
    appEvents.publish('duty.unassigned', { duty: outcome.duty, userId, actorId });
  }
  return outcome.response;
}

// --- Pläne ------------------------------------------------------------------

async function createPlan(actorId, fields, duties, { publish = false, notify = false } = {}) {
  const planId = await repository.withTransaction(async (conn) => {
    const id = await repository.insertPlan(conn, fields, actorId);
    await repository.insertDuties(conn, id, duties);
    return id;
  });
  if (publish) await publishPlan(actorId, planId, { notify });
  return planId;
}

async function addDuties(actorId, planId, duties, { notify = false } = {}) {
  const outcome = await repository.withTransaction(async (conn) => {
    const plan = await repository.lockPlan(conn, planId);
    if (!plan) return { response: result(404, PLAN_NOT_FOUND) };
    const count = await repository.countPlanDuties(conn, planId);
    if (count + duties.length > config.MAX_DUTIES_PER_PLAN) {
      return {
        response: result(400, `Ein Dienstplan hat höchstens ${config.MAX_DUTIES_PER_PLAN} Dienste.`),
      };
    }
    await repository.insertDuties(conn, planId, duties);
    return {
      response: result(201, duties.length === 1 ? 'Dienst angelegt.' : `${duties.length} Dienste angelegt.`),
      plan,
    };
  });
  // Neue Dienste in einem schon veröffentlichten Plan: auf Wunsch Push nur
  // über die neuen Dienste.
  if (outcome.plan && outcome.plan.status === 'published' && notify) {
    appEvents.publish('duties.published', {
      plan: outcome.plan,
      notify: true,
      actorId,
      added: duties.map((duty) => ({
        category: duty.category,
        title: duty.title,
        startTime: duty.start_time.replace(' ', 'T'),
        endTime: duty.end_time.replace(' ', 'T'),
        capacity: duty.capacity,
      })),
    });
  }
  return outcome.response;
}

/**
 * Entwurf veröffentlichen. Die Push-Nachricht geht nur beim ERSTEN
 * Veröffentlichen raus und nur, wenn der Haken gesetzt war.
 */
async function publishPlan(actorId, planId, { notify = false } = {}) {
  const outcome = await repository.withTransaction(async (conn) => {
    const plan = await repository.lockPlan(conn, planId);
    if (!plan) return { response: result(404, PLAN_NOT_FOUND) };
    if (plan.status === 'published') {
      return { response: result(409, 'Der Dienstplan ist schon veröffentlicht.') };
    }
    const count = await repository.countPlanDuties(conn, planId);
    if (count === 0) return { response: result(400, 'Der Dienstplan hat noch keine Dienste.') };
    await repository.publishPlan(conn, planId);
    return { response: result(200, 'Veröffentlicht.'), plan, count };
  });
  if (outcome.plan) {
    appEvents.publish('duties.published', {
      plan: outcome.plan,
      notify: Boolean(notify),
      actorId,
    });
  }
  return outcome.response;
}

/** Plan löschen. Eingetragene Personen kommender Dienste werden benachrichtigt. */
async function deletePlan(actorId, planId) {
  const outcome = await withRetry(async (conn) => {
    const plan = await repository.lockPlan(conn, planId);
    if (!plan) return { response: result(404, PLAN_NOT_FOUND) };
    // Dienste sperren: wer gerade zusagt, ist danach entweder drin (und wird
    // benachrichtigt) oder bekommt „nicht gefunden".
    const nowSql = nowSqlDateTime();
    const duties = (await repository.listPlanDuties(planId, conn, { forUpdate: true })).filter(
      (duty) => toSql(duty.startTime) > nowSql
    );
    const removed = [];
    for (const duty of duties) {
      const userIds = await repository.listAssigneeIds([duty.id], conn);
      if (userIds.length > 0) removed.push({ duty: { ...duty, planTitle: plan.title }, userIds });
    }
    await repository.deletePlan(planId, conn);
    return { response: result(200, 'Dienstplan gelöscht.'), plan, removed };
  });

  if (outcome.plan?.status === 'published') {
    for (const { duty, userIds } of outcome.removed) {
      appEvents.publish('duty.removed', { duty, userIds, actorId });
    }
  }
  return outcome.response;
}

// --- Dienste ----------------------------------------------------------------

/**
 * Dienst ändern. Die Plätze dürfen nicht unter die aktuelle Belegung sinken;
 * Eingetragene erfahren von einer neuen Uhrzeit.
 * @param {(existing:object) => object} validate liefert {ok, duty} | {ok:false,...}
 */
async function updateDuty(actorId, dutyId, validate) {
  const outcome = await withRetry(async (conn) => {
    // Gleiche Sperr-Reihenfolge wie bei einer Zusage: erst die Personen, dann
    // der Dienst. So kann niemand während des Verschiebens einen Dienst
    // annehmen, der sich mit der neuen Uhrzeit überschneidet.
    const assignees = await repository.listAssigneeIds([dutyId], conn);
    for (const userId of [...assignees].sort((a, b) => a - b)) {
      await repository.lockUser(conn, userId);
    }
    const before = await repository.findDuty(dutyId, conn, { forUpdate: true });
    if (!before) return { response: result(404, DUTY_NOT_FOUND) };

    const check = validate(before);
    if (!check.ok) return { response: result(check.status, check.message) };

    const moved =
      check.duty.start_time !== toSql(before.startTime) || check.duty.end_time !== toSql(before.endTime);
    if (moved) {
      // Wer nach dem Sperren der Zeile noch dazukam, wartete auf uns und ist
      // jetzt drin; seine Zusage hat die Überschneidung selbst geprüft.
      for (const userId of await repository.listAssigneeIds([dutyId], conn)) {
        const clash = await repository.findOverlapping(
          conn,
          userId,
          check.duty.start_time,
          check.duty.end_time,
          dutyId
        );
        if (clash) {
          const person = await repository.findPerson(userId, conn);
          const name = person ? `${person.firstName} ${person.lastName}` : 'Eine eingetragene Person';
          return {
            response: result(409, `${name} hat zu der neuen Zeit schon einen Dienst: ${clash.title}.`),
          };
        }
      }
    }

    const taken = await repository.countTaken(conn, dutyId);
    if (check.duty.capacity < taken) {
      return {
        response: result(
          409,
          `Es sind schon ${taken} Personen eingetragen. Erst austragen, dann Plätze verringern.`
        ),
      };
    }
    await repository.updateDuty(conn, dutyId, check.duty);
    const after = await repository.findDuty(dutyId, conn);
    const userIds = await repository.listAssigneeIds([dutyId], conn);
    return { response: result(200, 'Gespeichert.'), before, after, userIds };
  });

  const { before, after, userIds } = outcome;
  if (after && after.planStatus === 'published' && userIds.length > 0) {
    const moved = before.startTime !== after.startTime || before.endTime !== after.endTime;
    if (moved) appEvents.publish('duty.changed', { before, after, userIds, actorId });
  }
  return outcome.response;
}

async function deleteDuty(actorId, dutyId) {
  const outcome = await withRetry(async (conn) => {
    const duty = await repository.findDuty(dutyId, conn, { forUpdate: true });
    if (!duty) return { response: result(404, DUTY_NOT_FOUND) };
    const userIds = await repository.listAssigneeIds([dutyId], conn);
    await repository.deleteDuty(conn, dutyId);
    return { response: result(200, 'Dienst gelöscht.'), duty, userIds };
  });
  const { duty, userIds } = outcome;
  if (
    duty &&
    duty.planStatus === 'published' &&
    userIds.length > 0 &&
    toSql(duty.startTime) > nowSqlDateTime()
  ) {
    appEvents.publish('duty.removed', { duty, userIds, actorId });
  }
  return outcome.response;
}

// --- Darstellung ------------------------------------------------------------

/**
 * Dienst für die Anzeige, aus Sicht von `viewer` ({ id, role, services }).
 * Namen der Eingetragenen sieht jedes angemeldete Mitglied.
 */
function presentDuty(duty, assignments, viewer, nowSql, { showNames = true } = {}) {
  const mine = assignments.some((a) => a.userId === viewer.id);
  // Vereinseinstellung „Namen nur für die Verwaltung": Dann sieht man nur,
  // wie viele Plätze belegt sind, und sich selbst.
  const visible = showNames ? assignments : assignments.filter((a) => a.userId === viewer.id);
  const started = toSql(duty.startTime) <= nowSql;
  return {
    id: duty.id,
    planId: duty.planId,
    title: duty.title,
    category: duty.category,
    categoryLabel: categories.label(duty.category),
    startTime: duty.startTime,
    endTime: duty.endTime,
    capacity: duty.capacity,
    taken: assignments.length,
    assignees: visible.map((a) => ({
      id: a.userId,
      firstName: a.firstName,
      lastName: a.lastName,
      photoUrl: a.photoUrl,
    })),
    mine,
    started,
    canTake: !started && categories.canTake(duty.category, viewer),
  };
}

module.exports = {
  FULL_MESSAGE,
  claim,
  unassign,
  createPlan,
  addDuties,
  publishPlan,
  deletePlan,
  updateDuty,
  deleteDuty,
  presentDuty,
  isAdmin,
};
