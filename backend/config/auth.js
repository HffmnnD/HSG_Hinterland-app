// Zentrale Konfiguration für JWT und das Auth-Cookie, damit Controller und
// Middleware dieselben Werte verwenden.
require('dotenv').config({ quiet: true });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-bitte-in-.env-aendern',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_NAME: process.env.AUTH_COOKIE_NAME || 'token',
  SALT_ROUNDS: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  // Optionen für den HttpOnly-Cookie. `secure` nur in Produktion, damit der
  // Cookie in der lokalen Entwicklung (http://localhost) gesetzt wird.
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SEVEN_DAYS_MS,
  },
};
