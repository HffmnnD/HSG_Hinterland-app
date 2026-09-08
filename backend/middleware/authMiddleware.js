// Middleware:
//  - authenticate: prüft das JWT aus dem HttpOnly-Cookie
//  - checkRole:    prüft die Rolle des angemeldeten Nutzers (RBAC)
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const { JWT_SECRET, COOKIE_NAME } = require('../config/auth');

function authenticate(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: 'Nicht authentifiziert.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    // Rolle aus dem Token (Stand: letzter Login). Die autoritative Prüfung
    // erfolgt in checkRole gegen die Datenbank.
    req.userRole = payload.role;
    return next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: 'Ungültiges oder abgelaufenes Token.' });
  }
}

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
      // Rolle frisch aus der DB lesen, damit Entzug/Änderung sofort greift.
      const [rows] = await pool.query(
        'SELECT role, is_approved FROM users WHERE id = ?',
        [req.userId]
      );
      const user = rows[0];

      if (!user) {
        return res.status(401).json({ message: 'Benutzer nicht gefunden.' });
      }
      if (!user.is_approved) {
        return res
          .status(403)
          .json({ message: 'Dein Konto wurde noch nicht freigegeben.' });
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
      console.error('Fehler bei der Rollenprüfung:', err);
      return res
        .status(500)
        .json({ message: 'Interner Serverfehler bei der Rollenprüfung.' });
    }
  };
}

module.exports = { authenticate, checkRole };
