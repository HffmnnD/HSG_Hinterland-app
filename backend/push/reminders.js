// Erinnerung vor dem Termin.
//
// Bei euch gilt „keine Rückmeldung = dabei". Die Erinnerung ist deshalb kein
// „Bitte zu- oder absagen" wie bei anderen Vereins-Apps üblich, sondern ein Wink, solange
// noch Zeit zum Absagen ist. Wer schon abgesagt hat oder im Urlaub bzw.
// verletzt eingetragen ist, bekommt keine.
//
// Läuft alle fünf Minuten im Server-Prozess. Jede Erinnerung geht genau einmal
// raus (push_log), auch über einen Neustart hinweg.
const eventRepository = require('../repositories/eventRepository');
const scheduleService = require('../services/scheduleService');
const repository = require('./repository');
const messages = require('./messages');
const { sendToUsers } = require('./sender');
const { REMINDER_HOURS, DUTY_REMINDER_HOURS, resolve } = require('./preferences');
const dutyRepository = require('../duties/repository');
const { REMINDER_TICK_MS } = require('./config');
const { nowSqlDateTime, addMinutesToSql } = require('../utils/schedule');

const MAX_LEAD_MINUTES = Math.max(...REMINDER_HOURS) * 60;
const MAX_DUTY_LEAD_MINUTES = Math.max(...DUTY_REMINDER_HOURS) * 60;

let timer = null;
let running = false;
let lastPrune = 0;

async function tick(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const nowSql = nowSqlDateTime(now);
    const ids = await repository.listEventIdsStartingBetween(
      nowSql,
      addMinutesToSql(nowSql, MAX_LEAD_MINUTES)
    );

    for (const id of ids) {
      const event = await eventRepository.findById(id);
      if (!event) continue;
      await remindFor(event, now);
    }

    const duties = await dutyRepository.listDutiesStartingBetween(
      nowSql,
      addMinutesToSql(nowSql, MAX_DUTY_LEAD_MINUTES)
    );
    for (const duty of duties) {
      await remindForDuty(duty, now);
    }

    if (now.getTime() - lastPrune > 24 * 3600000) {
      lastPrune = now.getTime();
      await repository.pruneLog();
    }
  } catch (err) {
    console.error('Push-Erinnerungen fehlgeschlagen:', err.message);
  } finally {
    running = false;
  }
}

async function remindFor(event, now) {
  const minutesLeft = (new Date(event.startTime).getTime() - now.getTime()) / 60000;
  const [roster] = (await scheduleService.buildStatusByEvent([event])).values();

  const candidates = (roster ?? [])
    .filter((entry) => entry.status !== 'DECLINED')
    .map((entry) => entry.userId);
  if (candidates.length === 0) return;

  // Erst Einstellungen prüfen, DANN als verschickt vermerken: Wer die
  // Erinnerung auf „1 Stunde vorher" stehen hat, darf bei der 24-Stunden-Runde
  // nicht schon abgehakt werden.
  const targets = await repository.listTargets(candidates);
  const due = new Set();
  for (const target of targets) {
    const prefs = resolve(target.settings);
    if (prefs.reminders && prefs.reminderHours * 60 >= minutesLeft) {
      due.add(target.user_id);
    }
  }

  const recipients = [];
  for (const userId of due) {
    if (await repository.claimOnce(userId, `reminder:${event.id}`)) {
      recipients.push(userId);
    }
  }
  await sendToUsers(recipients, 'reminders', messages.reminder(event, now));
}

/** Erinnerung an den eigenen Dienst, mit der eigenen Vorlaufzeit. */
async function remindForDuty(duty, now) {
  const minutesLeft = (new Date(duty.startTime).getTime() - now.getTime()) / 60000;
  const assignees = await dutyRepository.listAssigneeIds([duty.id]);
  const targets = await repository.listTargets(assignees);

  const due = new Set();
  for (const target of targets) {
    const prefs = resolve(target.settings);
    if (prefs.dutyReminders && prefs.dutyReminderHours * 60 >= minutesLeft) {
      due.add(target.user_id);
    }
  }

  // Beginn im Schlüssel: Wird der Dienst verschoben, kommt die Erinnerung
  // zur neuen Zeit noch einmal.
  const key = `duty-reminder:${duty.id}:${duty.startTime}`;
  const recipients = [];
  for (const userId of due) {
    if (await repository.claimOnce(userId, key)) recipients.push(userId);
  }
  await sendToUsers(recipients, 'dutyReminders', messages.dutyReminder(duty, now));
}

function start() {
  if (timer) return;
  timer = setInterval(tick, REMINDER_TICK_MS);
  // Der Takt allein soll den Prozess nicht am Beenden hindern.
  timer.unref();
  // Erster Lauf kurz nach dem Start, nicht erst nach fünf Minuten.
  setTimeout(tick, 15000).unref();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
