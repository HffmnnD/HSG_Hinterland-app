// Middleware:
//  - authenticate: prüft das JWT aus dem HttpOnly-Cookie
//  - checkRole:    prüft die Rolle des angemeldeten Nutzers (RBAC)
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const {
  JWT_SECRET,
  JWT_ALGORITHMS,
  COOKIE_NAME,
} = require('../config/auth');

function authenticate(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: 'Nicht authentifiziert.' });
  }

  try {
    // algorithms explizit setzen: verhindert Algorithm-Confusion-Angriffe.
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: JWT_ALGORITHMS,
    });

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Ungültiges Token.' });
    }

    req.userId = userId;
    // Rolle aus dem Token (Stand: letzter Login). Die autoritative Prüfung
    // erfolgt in checkRole gegen die Datenbank.
    req.userRole = payload.role;
    // Ausstellungszeit (Unix-Sekunden). checkRole und /api/auth/me vergleichen
    // sie mit `users.sessions_valid_from` – ein Passwortwechsel entwertet damit
    // alle älteren Tokens.
    req.tokenIssuedAt = Number(payload.iat) || 0;
    return next();
  } catch {
    return res
      .status(401)
      .json({ message: 'Ungültiges oder abgelaufenes Token.' });
  }
}

/**
 * Gilt das Token noch, oder wurde es durch einen Passwortwechsel entwertet?
 *
 * `sessions_valid_from` ist der Zeitpunkt des letzten Passwortwechsels in
 * Unix-Sekunden, `iat` die Ausstellungszeit des Tokens in derselben Einheit.
 * Ältere Tokens fallen durch – ohne Denylist und ohne zusätzliche Abfrage, denn
 * die Zeile wird hier ohnehin gelesen.
 *
 * @param {{ sessions_valid_from?: number }} user
 * @param {number} issuedAt
 */
function isTokenCurrent(user, issuedAt) {
  const validFrom = Number(user.sessions_valid_from) || 0;
  return validFrom === 0 || issuedAt >= validFrom;
}

const SESSION_ENDED_MESSAGE =
  'Diese Sitzung ist nicht mehr gültig. Bitte melde dich erneut an.';

/**
 * Erzeugt eine Middleware, die sicherstellt, dass der angemeldete Nutzer eine
 * der erlaubten Rollen besitzt. Muss nach `authenticate` eingehängt werden.
 *
 * @param {string|string[]} allowedRoles z. B. 'admin' oder ['admin', 'trainer']
 */
function checkRole(allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async function roleGuard(req, res, next) {
    if (!req.userId) {
      return res.status(401).json({ message: 'Nicht authentifiziert.' });
    }

    try {
      // Rolle, Sperrstatus und Sitzungsgrenze frisch aus der DB lesen, damit
      // eine Änderung sofort greift (nicht erst nach Ablauf des 7-Tage-Tokens).
      const [rows] = await pool.query(
        'SELECT role, is_approved, sessions_valid_from FROM users WHERE id = ?',
        [req.userId]
      );
      const user = rows[0];

      if (!user) {
        return res.status(401).json({ message: 'Benutzer nicht gefunden.' });
      }
      if (!isTokenCurrent(user, req.tokenIssuedAt)) {
        return res.status(401).json({ message: SESSION_ENDED_MESSAGE });
      }
      if (!user.is_approved) {
        return res
          .status(403)
          .json({ message: 'Dieses Konto wurde gesperrt.' });
      }

      req.userRole = user.role;

      if (!allowed.includes(user.role)) {
        return res.status(403).json({
          message: 'Keine Berechtigung für diese Ressource.',
          requiredRoles: allowed,
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authenticate, checkRole, isTokenCurrent, SESSION_ENDED_MESSAGE };
