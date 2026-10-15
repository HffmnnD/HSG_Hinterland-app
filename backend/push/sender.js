// Verschickt Nachrichten an die Geräte der Empfänger:innen.
//
// Jede Nachricht gehört zu einer Kategorie (siehe preferences.js). Wer die
// Kategorie ausgeschaltet hat, bekommt nichts; wer die Ruhezeit an hat,
// bekommt nachts eine stille Nachricht. Geräte, die der Push-Dienst als
// abgemeldet meldet (404/410), werden sofort entfernt.
const webpush = require('web-push');

const config = require('./config');
const repository = require('./repository');
const preferences = require('./preferences');

if (config.enabled) {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
}

// So viele Zustellungen laufen gleichzeitig. Eine Mannschaft hat selten mehr
// als 30 Geräte, Vereins-News erreichen aber alle – ohne Grenze wären das
// hunderte offene Verbindungen auf einmal.
const BATCH_SIZE = 25;

// Standard-Haltbarkeit beim Push-Dienst: Ist ein Handy so lange aus, verfällt
// die Nachricht, statt Tage später veraltet aufzutauchen.
const DEFAULT_TTL_SECONDS = 12 * 3600;

/**
 * @typedef {object} PushMessage
 * @property {string} title
 * @property {string} body
 * @property {string} [url]   Seite, die ein Tippen öffnet
 * @property {string} [tag]   gleicher Tag ersetzt die ältere Nachricht
 * @property {number} [ttl]   Sekunden, die der Push-Dienst zustellen darf
 */

/**
 * @param {number[]} userIds
 * @param {string|null} category Schlüssel aus preferences.DEFAULTS, null = immer
 * @param {PushMessage} message
 * @param {{ exclude?: number|null, accept?: (prefs:object) => boolean }} [options]
 *   exclude: wer die Änderung selbst gemacht hat, bekommt keine Nachricht
 *   accept:  zusätzliche Bedingung auf die Einstellungen (z. B. Vorlaufzeit)
 * @returns {Promise<number>} Anzahl erfolgreich zugestellter Nachrichten
 */
async function sendToUsers(userIds, category, message, options = {}) {
  if (!config.enabled) return 0;

  const ids = [...new Set(userIds)].filter((id) => id !== options.exclude);
  if (ids.length === 0) return 0;

  const quiet = preferences.isQuietTime();
  const jobs = [];
  for (const target of await repository.listTargets(ids)) {
    const prefs = preferences.resolve(target.settings);
    if (category && !prefs[category]) continue;
    if (options.accept && !options.accept(prefs)) continue;
    jobs.push(() => deliver(target, message, quiet && prefs.quietHours));
  }

  let delivered = 0;
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const results = await Promise.all(jobs.slice(i, i + BATCH_SIZE).map((job) => job()));
    delivered += results.filter(Boolean).length;
  }
  return delivered;
}

/** Eine Nachricht an ein Gerät. true bei Erfolg, wirft nie. */
async function deliver(target, message, silent) {
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? '/',
    tag: message.tag ?? null,
    silent,
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      payload,
      {
        TTL: Math.max(60, Math.round(message.ttl ?? DEFAULT_TTL_SECONDS)),
        // Absagen sollen auch ein schlafendes Android sofort erreichen.
        urgency: message.urgent ? 'high' : 'normal',
        timeout: 10000,
      }
    );
    await repository.markDelivered(target.id);
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Abo beim Dienst erloschen (App gelöscht, Berechtigung entzogen).
      await repository.deleteSubscriptionById(target.id);
    } else {
      console.warn(
        `Push an Gerät ${target.id} fehlgeschlagen:`,
        err.statusCode ?? err.code ?? err.message
      );
    }
    return false;
  }
}

module.exports = { sendToUsers };
