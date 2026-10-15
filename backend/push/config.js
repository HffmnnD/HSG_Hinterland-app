// Einstellungen des Push-Moduls aus der .env.
//
// Web Push braucht ein Schlüsselpaar (VAPID), mit dem sich der Server bei den
// Push-Diensten der Browser ausweist. Erzeugen mit:
//
//   npm run push:keys
//
// Fehlen die Schlüssel, bleibt das Modul still: Die App läuft normal weiter,
// die Einstellungen zeigen „auf diesem Server nicht eingerichtet".
require('dotenv').config({ quiet: true });

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
// Kontakt für die Push-Dienste, falls der Server Ärger macht. Pflicht laut
// Standard, muss mit mailto: oder https: beginnen.
const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@hsg-hinterland.de';

const enabled = Boolean(publicKey && privateKey);

// Nur an diese Push-Dienste wird geschickt. Ohne die Liste könnte ein Konto
// eine beliebige Adresse als „Gerät" eintragen und den Server Anfragen an
// interne Dienste schicken lassen (SSRF).
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android), Samsung Internet
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, // Safari, iPhone/iPad (vom Home-Bildschirm)
  /(^|\.)notify\.windows\.com$/, // Edge (Windows)
];

module.exports = {
  enabled,
  publicKey,
  privateKey,
  subject,
  ALLOWED_PUSH_HOSTS,
  // Ruhezeit: In diesem Fenster kommen Nachrichten ohne Ton (Ortszeit).
  QUIET_FROM_HOUR: 22,
  QUIET_UNTIL_HOUR: 7,
  // Trainer:innen hören von Absagen, die so kurz vor Beginn eingehen.
  SHORT_NOTICE_HOURS: 24,
  // Takt der Erinnerungen.
  REMINDER_TICK_MS: 5 * 60 * 1000,
};
