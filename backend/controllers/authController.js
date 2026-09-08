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
const {
  normalizeTeamIds,
  normalizeTeamRelations,
  loadTeamsForUser,
  insertUserTeamRelations,
} = require('../utils/teams');
const {
  normalizeServices,
  loadServicesForUser,
  replaceUserServices,
} = require('../utils/services');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt berücksichtigt nur die ersten 72 Bytes – längere Eingaben ablehnen,
// statt sie still abzuschneiden.
const MAX_PASSWORD_LENGTH = 72;

// Echter Hash eines Dummy-Passworts. Wird beim Login gegen nicht existierende
// Accounts verglichen, damit die Antwortzeit nicht verrät, ob es die
// E-Mail-Adresse gibt (Timing-basierte User-Enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-attack-dummy-password',
  SALT_ROUNDS
);

// Einheitliche Aufbereitung der User-Daten für die API-Antwort.
function toPublicUser(row, teams = [], services = []) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    isApproved: Boolean(row.is_approved),
    role: row.role,
    teams,
    services,
    createdAt: row.created_at,
  };
}

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      teams,
      teamIds,
      services,
    } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: 'firstName, lastName, email und password sind erforderlich.',
      });
    }

    // Typen prüfen: JSON kann Objekte/Arrays liefern, die sonst als
    // "[object Object]" in der DB landen würden.
    if (
      typeof firstName !== 'string' ||
      typeof lastName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res
        .status(400)
        .json({ message: 'Alle Felder müssen Zeichenketten sein.' });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (
      cleanFirstName.length === 0 ||
      cleanFirstName.length > MAX_NAME_LENGTH ||
      cleanLastName.length === 0 ||
      cleanLastName.length > MAX_NAME_LENGTH
    ) {
      return res.status(400).json({
        message: `Vor- und Nachname dürfen nicht leer und höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`,
      });
    }
    if (
      normalizedEmail.length > MAX_EMAIL_LENGTH ||
      !EMAIL_REGEX.test(normalizedEmail)
    ) {
      return res.status(400).json({ message: 'Ungültige E-Mail-Adresse.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`,
      });
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`,
      });
    }

    // Mannschaften sind optional. Bevorzugt `teams: [{ teamId, relationType }]`;
    // `teamIds: [1, 2]` bleibt als Kurzform für Spieler-Zuordnungen erlaubt.
    let relationsToAssign = [];
    if (teams !== undefined) {
      const teamCheck = await normalizeTeamRelations(teams);
      if (!teamCheck.ok) {
        return res.status(400).json({ message: teamCheck.message });
      }
      relationsToAssign = teamCheck.relations ?? [];
    } else if (teamIds !== undefined) {
      const legacyCheck = await normalizeTeamIds(teamIds);
      if (!legacyCheck.ok) {
        return res.status(400).json({ message: legacyCheck.message });
      }
      relationsToAssign = (legacyCheck.ids ?? []).map((teamId) => ({
        teamId,
        relationType: 'player',
      }));
    }

    // Helferdienste (Mitwirkende) sind ebenfalls optional.
    const serviceCheck = normalizeServices(services);
    if (!serviceCheck.ok) {
      return res.status(400).json({ message: serviceCheck.message });
    }
    const servicesToAssign = serviceCheck.services ?? [];

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Neue User werden mit is_approved = 0 und der Standardrolle angelegt.
    // Die Rolle kommt bewusst NICHT aus dem Request (keine Rechteausweitung),
    // sondern aus dem Spaltenstandard bzw. später über den Admin-Bereich.
    const conn = await pool.getConnection();
    let userId;
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, is_approved)
         VALUES (?, ?, ?, ?, 0)`,
        [cleanFirstName, cleanLastName, normalizedEmail, passwordHash]
      );
      userId = result.insertId;

      await insertUserTeamRelations(conn, userId, relationsToAssign);
      await replaceUserServices(conn, userId, servicesToAssign);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      // Der UNIQUE-Index auf email ist die einzige Quelle der Wahrheit –
      // kein SELECT-dann-INSERT (Race Condition).
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res
          .status(409)
          .json({ message: 'Diese E-Mail-Adresse ist bereits registriert.' });
      }
      throw err;
    } finally {
      conn.release();
    }

    const [assignedTeams, assignedServices] = await Promise.all([
      loadTeamsForUser(userId),
      loadServicesForUser(userId),
    ]);

    return res.status(201).json({
      message:
        'Registrierung erfolgreich. Dein Konto muss noch von einem Admin freigegeben werden.',
      user: {
        id: userId,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: normalizedEmail,
        isApproved: false,
        teams: assignedTeams,
        services: assignedServices,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (
      !email ||
      !password ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res
        .status(400)
        .json({ message: 'email und password sind erforderlich.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, is_approved, role, created_at
       FROM users WHERE email = ?`,
      [normalizedEmail]
    );

    // Gleiche Fehlermeldung für "User existiert nicht" und "falsches Passwort",
    // damit keine gültigen E-Mail-Adressen preisgegeben werden.
    const user = rows[0];
    if (!user) {
      // Dummy-Vergleich, damit die Antwortzeit nicht verrät, ob es den
      // Account gibt.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res
        .status(401)
        .json({ message: 'E-Mail-Adresse oder Passwort ist falsch.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
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
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Cookie-Lebensdauer exakt aus dem Token ableiten, damit Cookie und Token
    // nicht auseinanderlaufen, wenn JWT_EXPIRES_IN geändert wird.
    const { exp } = jwt.decode(token);
    const maxAge = Math.max(0, exp * 1000 - Date.now());

    // JWT als HttpOnly-Cookie an den Client senden.
    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge });

    const [userTeams, userServices] = await Promise.all([
      loadTeamsForUser(user.id),
      loadServicesForUser(user.id),
    ]);

    return res.json({
      message: 'Login erfolgreich.',
      user: toPublicUser(user, userTeams, userServices),
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/logout
function logout(req, res) {
  // Beim Löschen müssen dieselben Optionen verwendet werden, mit denen der
  // Cookie gesetzt wurde (ohne maxAge).
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.json({ message: 'Logout erfolgreich.' });
}

// GET /api/auth/me  (geschützt durch authenticate)
async function me(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, is_approved, role, created_at
       FROM users WHERE id = ?`,
      [req.userId]
    );

    const user = rows[0];
    if (!user) {
      // Konto wurde gelöscht – Cookie entwerten.
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(401).json({ message: 'Benutzer nicht gefunden.' });
    }

    // Freigabe kann nach dem Login entzogen worden sein. Dann darf die Sitzung
    // nicht weiterlaufen.
    if (!user.is_approved) {
      res.clearCookie(COOKIE_NAME, cookieOptions);
      return res.status(403).json({
        message: 'Dein Konto ist nicht (mehr) freigegeben.',
      });
    }

    const [userTeams, userServices] = await Promise.all([
      loadTeamsForUser(user.id),
      loadServicesForUser(user.id),
    ]);

    return res.json({ user: toPublicUser(user, userTeams, userServices) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, logout, me };
