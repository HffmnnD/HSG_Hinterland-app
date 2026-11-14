// Middleware:
//  - authenticate:        prüft das JWT aus dem HttpOnly-Cookie UND den
//                         aktuellen Kontostand (Sperre, Sitzungsgrenze, Rechte)
//  - requirePermission:   verlangt ein Recht aus access/permissions.js
//  - forbidWhileActingAs: sperrt Endpunkte, solange Eltern als Kind handeln
const jwt = require('jsonwebtoken');

const {
  JWT_SECRET,
  JWT_ALGORITHMS,
  COOKIE_NAME,
  cookieOptions,
} = require('../config/auth');
const access = require('../access/service');

const SESSION_ENDED_MESSAGE =
  'Diese Sitzung ist nicht mehr gültig. Bitte melde dich erneut an.';
const ACCOUNT_LOCKED_MESSAGE =
  'Dieses Konto wurde gesperrt. Bitte wende dich an einen Admin.';

// Eltern handeln als Kind, indem der Client diesen Header mitschickt. Ein
// eigener Header (statt Cookie) kann von fremden Seiten nicht gesetzt werden:
// CORS lässt ihn nur von erlaubten Origins durch.
const ACT_AS_HEADER = 'x-act-as';

/**
 * Gilt das Token noch, oder wurde es durch einen Passwortwechsel entwertet?
 * `sessionsValidFrom` und `iat` sind beide Unix-Sekunden.
 */
function isTokenCurrent(user, issuedAt) {
  const validFrom = Number(user.sessions_valid_from ?? user.sessionsValidFrom) || 0;
  return validFrom === 0 || issuedAt >= validFrom;
}

function reject(res, status, message) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.status(status).json({ message });
}

/**
 * Anmeldung prüfen. Liest das Konto bei JEDER Anfrage (kurz gecacht, siehe
 * access/service.js), damit Sperre, Rollenwechsel und Passwortwechsel sofort
 * greifen – nicht erst, wenn das 7-Tage-Token abläuft.
 *
 * Setzt: req.userId, req.userRole, req.access (Rechte), req.tokenIssuedAt
 * und beim Handeln als Kind zusätzlich req.actingAs, req.actorId, req.actorAccess.
 */
async function authenticate(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'Nicht authentifiziert.' });
  }

  let payload;
  try {
    // algorithms explizit setzen: verhindert Algorithm-Confusion-Angriffe.
    payload = jwt.verify(token, JWT_SECRET, { algorithms: JWT_ALGORITHMS });
  } catch {
    return res.status(401).json({ message: 'Ungültiges oder abgelaufenes Token.' });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: 'Ungültiges Token.' });
  }

  try {
    const account = await access.getAccess(userId);
    if (!account) return reject(res, 401, 'Benutzer nicht gefunden.');

    const issuedAt = Number(payload.iat) || 0;
    if (!isTokenCurrent(account, issuedAt)) return reject(res, 401, SESSION_ENDED_MESSAGE);
    if (!account.isApproved) return reject(res, 403, ACCOUNT_LOCKED_MESSAGE);

    req.tokenIssuedAt = issuedAt;
    req.userId = account.userId;
    req.userRole = account.role;
    req.access = account;
    req.actingAs = false;

    const actAs = req.get(ACT_AS_HEADER);
    if (actAs) {
      const childId = Number(actAs);
      if (!Number.isInteger(childId) || !account.childIds.includes(childId)) {
        return res.status(403).json({ message: 'Dieses Konto ist nicht mit deinem verknüpft.' });
      }
      const child = await access.getAccess(childId);
      if (!child || !child.isApproved) {
        return res.status(403).json({ message: 'Das Konto deines Kindes ist gesperrt.' });
      }
      req.actingAs = true;
      req.actorId = account.userId;
      req.actorAccess = account;
      req.userId = child.userId;
      req.userRole = child.role;
      req.access = child;
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Verlangt mindestens EINES der genannten Rechte.
 * @param {...string} permissions
 */
function requirePermission(...permissions) {
  return function permissionGuard(req, res, next) {
    if (!req.access) return res.status(401).json({ message: 'Nicht authentifiziert.' });
    if (!permissions.some((perm) => req.access.permissions.has(perm))) {
      return res.status(403).json({ message: 'Dafür fehlt dir die Berechtigung.' });
    }
    return next();
  };
}

/** Konto-, Verwaltungs- und Familienfunktionen nur im eigenen Namen. */
function forbidWhileActingAs(req, res, next) {
  if (req.actingAs) {
    return res.status(403).json({
      message: 'Das geht nur in deinem eigenen Konto. Wechsle zuerst zurück.',
    });
  }
  return next();
}

module.exports = {
  authenticate,
  requirePermission,
  forbidWhileActingAs,
  isTokenCurrent,
  SESSION_ENDED_MESSAGE,
  ACCOUNT_LOCKED_MESSAGE,
  ACT_AS_HEADER,
};
