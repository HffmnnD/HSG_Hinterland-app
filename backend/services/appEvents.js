// Fachliche Ereignisse der App („Termin abgesagt", „Beitrag veröffentlicht").
//
// Die Controller melden hier nur, WAS passiert ist – wer sich dafür
// interessiert, entscheiden sie nicht. Heute hört das Push-Modul zu
// (backend/push/). Wird es entfernt, laufen die Meldungen ins Leere und
// kosten nichts.
//
// Zugestellt wird erst NACH der laufenden Anfrage (setImmediate): Ein
// langsamer oder fehlerhafter Zuhörer darf keine Antwort verzögern und keine
// Anfrage scheitern lassen.
//
// Ereignisse und ihre Daten (`event` ist immer der Stand VOR der Änderung):
//   event.created        { teamId, seriesId|null, eventId|null, actorId }
//   event.updated        { before, after, actorId }
//   event.cancelled      { event, reason, actorId }
//   event.reinstated     { event, reason, actorId }
//   event.deleted        { event, actorId }
//   event.rescheduled    { event, previousStart, newStart }  (nuLiga-Abgleich)
//   series.updated       { event, fields, changed, actorId }
//   series.ended         { series:{id,teamId,title}, removed, actorId }
//   attendance.changed   { event, userId, status, reason, actorId }
//   membership.changed   { userId }   (eigene Mannschaftswahl gespeichert)
//   membership.confirmed { userId, teamId, relationType, actorId }
//   news.published       { news, actorId }
const { EventEmitter } = require('events');

const bus = new EventEmitter();
// Mehrere Module dürfen zuhören, ohne dass Node eine Leck-Warnung ausgibt.
bus.setMaxListeners(20);

/**
 * Ereignis melden. Gibt sofort zurück.
 * @param {string} name
 * @param {object} payload
 */
function publish(name, payload) {
  if (bus.listenerCount(name) === 0) return;
  setImmediate(() => bus.emit(name, payload));
}

/**
 * Auf ein Ereignis hören. Asynchrone Zuhörer werden abgesichert: Eine
 * abgelehnte Promise landet im Log, nicht als unbehandelte Rejection.
 * @param {string} name
 * @param {(payload:object) => (void|Promise<void>)} handler
 */
function subscribe(name, handler) {
  bus.on(name, (payload) => {
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error(`Fehler im Zuhörer für „${name}":`, err));
  });
}

module.exports = { publish, subscribe };
