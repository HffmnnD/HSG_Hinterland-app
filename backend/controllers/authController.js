// Auth-Controller: Registrierung, Login, Logout und Auth-Status.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  COOKIE_NAME,
  SALT_ROUNDS,
  cookieOptions,
} = require('../config/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Einheitliche Aufbereitung der User-Daten für die API-Antwort.
function toPublicUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    isApproved: Boolean(row.is_approved),
    createdAt: row.created_at,
  };
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { firstName, lastName, email, password } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: 'firstName, lastName, email und password sind erforderlich.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Ungültige E-Mail-Adresse.' });
    }
    if (String(password).length < 8) {
      return res
        .status(400)
        .json({ message: 'Das Passwort muss mindestens 8 Zeichen lang sein.' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ message: 'Diese E-Mail-Adresse ist bereits registriert.' });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

    // Neue User werden mit is_approved = 0 angelegt und müssen von einem
    // Admin freigegeben werden.
    const [result] = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, is_approved)
       VALUES (?, ?, ?, ?, 0)`,
      [String(firstName).trim(), String(lastName).trim(), normalizedEmail, passwordHash]
    );

    return res.status(201).json({
      message:
        'Registrierung erfolgreich. Dein Konto muss noch von einem Admin freigegeben werden.',
      user: {
        id: result.insertId,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizedEmail,
        isApproved: false,
      },
    });
  } catch (err) {
    // Falls der eindeutige Index auf `email` doch greift (Race Condition).
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res
        .status(409)
        .json({ message: 'Diese E-Mail-Adresse ist bereits registriert.' });
    }
    console.error('Fehler bei der Registrierung:', err);
    return res
      .status(500)
      .json({ message: 'Interner Serverfehler bei der Registrierung.' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'email und password sind erforderlich.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, is_approved, created_at
       FROM users WHERE email = ?`,
      [normalizedEmail]
    );

    // Gleiche Fehlermeldung für "User existiert nicht" und "falsches Passwort",
    // damit keine gültigen E-Mail-Adressen preisgegeben werden.
    const user = rows[0];
    if (!user) {
      return res
        .status(401)
        .json({ message: 'E-Mail-Adresse oder Passwort ist falsch.' });
    }

    const passwordMatches = await bcrypt.compare(
      String(password),
      user.password_hash
    );
    if (!passwordMatches) {
      return res
        .status(401)
        .json({ message: 'E-Mail-Adresse oder Passwort ist falsch.' });
    }

    if (!user.is_approved) {
      return res.status(403).json({
        message: 'Dein Konto wurde noch nicht von einem Admin freigegeben.',
      });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // JWT als HttpOnly-Cookie an den Client senden.
    res.cookie(COOKIE_NAME, token, cookieOptions);

    return res.json({
      message: 'Login erfolgreich.',
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error('Fehler beim Login:', err);
    return res
      .status(500)
      .json({ message: 'Interner Serverfehler beim Login.' });
  }
}

// POST /api/auth/logout
function logout(req, res) {
  // Beim Löschen müssen dieselben Optionen (ohne maxAge) verwendet werden,
  // mit denen der Cookie gesetzt wurde.
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(COOKIE_NAME, clearOptions);
  return res.json({ message: 'Logout erfolgreich.' });
}

// GET /api/auth/me  (geschützt durch authMiddleware)
async function me(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, is_approved, created_at
       FROM users WHERE id = ?`,
      [req.userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
    }

    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('Fehler bei /me:', err);
    return res.status(500).json({ message: 'Interner Serverfehler.' });
  }
}

module.exports = { register, login, logout, me };
