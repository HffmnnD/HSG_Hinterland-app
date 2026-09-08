// Zentrale Konfiguration für JWT und das Auth-Cookie, damit Controller und
// Middleware dieselben Werte verwenden.
require('dotenv').config({ quiet: true });

const PLACEHOLDER_SECRETS = [
  'dev-secret-bitte-in-.env-aendern',
  'bitte-langen-zufaelligen-wert-eintragen',
  'changeme',
  'secret',
];

const JWT_SECRET = process.env.JWT_SECRET;

// SICHERHEIT: Kein Fallback-Secret. Ein fest im Code hinterlegtes Secret wäre
// öffentlich bekannt – damit könnte jeder ein gültiges Admin-Token signieren.
// Lieber sofort beim Start abbrechen als unsicher weiterlaufen.
if (!JWT_SECRET || PLACEHOLDER_SECRETS.includes(JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET fehlt oder ist ein Platzhalter.\n' +
      'Trage in backend/.env einen langen, zufälligen Wert ein, z. B.:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

if (JWT_SECRET.length < 32) {
  console.warn(
    '[WARN] JWT_SECRET ist kürzer als 32 Zeichen – bitte ein längeres Secret verwenden.'
  );
}

// `secure` erzwingt HTTPS. Standardmäßig an, sobald NODE_ENV=production; über
// COOKIE_SECURE lässt es sich unabhängig davon explizit setzen.
const cookieSecure =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Nur HS256 zulassen (verhindert Algorithm-Confusion).
  JWT_ALGORITHMS: ['HS256'],
  COOKIE_NAME: process.env.AUTH_COOKIE_NAME || 'token',
  SALT_ROUNDS: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  // Basis-Optionen für den HttpOnly-Cookie – OHNE maxAge. Die Lebensdauer wird
  // beim Login aus dem `exp` des Tokens abgeleitet, damit Cookie und Token
  // niemals auseinanderlaufen.
  cookieOptions: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
  },
};
