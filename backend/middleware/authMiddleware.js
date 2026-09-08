// Middleware: prüft das JWT aus dem HttpOnly-Cookie und legt userId /
// userEmail an req an.
const jwt = require('jsonwebtoken');

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
    return next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: 'Ungültiges oder abgelaufenes Token.' });
  }
}

module.exports = authenticate;
