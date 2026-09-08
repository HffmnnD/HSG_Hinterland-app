// Auth-Controller: Registrierung, Login, Logout, Auth-Status.
//
// Kein SQL in dieser Datei – Datenzugriff läuft über userRepository,
// Eingabe-Prüfung über utils/validation.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  COOKIE_NAME,
  SALT_ROUNDS,
  cookieOptions,
} = require('../config/auth');
const userRepository = require('../repositories/userRepository');
const { validateRegistration } = require('../utils/validation');

const REGISTER_OK_MESSAGE =
  'Registrierung erfolgreich. Dein Konto muss noch von einem Admin freigegeben werden.';
const BAD_CREDENTIALS_MESSAGE = 'E-Mail-Adresse oder Passwort ist falsch.';

// Echter Hash eines Dummy-Passworts. Wird beim Login gegen nicht existierende
// Konten verglichen, damit die Antwortzeit nicht verrät, ob es die
// E-Mail-Adresse gibt (Timing-basierte User-Enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-attack-dummy-password',
  SALT_ROUNDS
);

// --- Cookie / Session --------------------------------------------------------

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  // Cookie-Lebensdauer exakt aus dem Token ableiten, damit beide nicht
  // auseinanderlaufen, wenn JWT_EXPIRES_IN geändert wird.
  const { exp } = jwt.decode(token);
  const maxAge = Math.max(0, exp * 1000 - Date.now());
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

// --- Endpunkte --------------------------------------------------------------

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const input = await validateRegistration(req.body);
    if (!input.ok) {
      return res.status(input.status).json({ message: input.message });
    }

    const passwordHash = await bcrypt.hash(input.account.password, SALT_ROUNDS);

    const userId = await userRepository.createWithProfile({
      account: {
        firstName: input.account.firstName,
        lastName: input.account.lastName,
        email: input.account.email,
        passwordHash,
      },
      relations: input.relations,
      services: input.services,
    });

    const user = await userRepository.getFullProfile(userId);
    return res.status(201).json({ message: REGISTER_OK_MESSAGE, user });
  } catch (err) {
    // Der UNIQUE-Index auf email ist die einzige Quelle der Wahrheit
    // (kein SELECT-dann-INSERT -> keine Race Condition).
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res
        .status(409)
        .json({ message: 'Diese E-Mail-Adresse ist bereits registriert.' });
    }
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

    const user = await userRepository.findByEmail(email.trim().toLowerCase());

    // Gleiche Meldung für "Konto existiert nicht" und "falsches Passwort".
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH); // Timing angleichen
      return res.status(401).json({ message: BAD_CREDENTIALS_MESSAGE });
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: BAD_CREDENTIALS_MESSAGE });
    }
    if (!user.is_approved) {
      return res.status(403).json({
        message: 'Dein Konto wurde noch nicht von einem Admin freigegeben.',
      });
    }

    setSessionCookie(res, user);
    const profile = await userRepository.buildProfile(user);
    return res.json({ message: 'Login erfolgreich.', user: profile });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/logout
function logout(req, res) {
  clearSessionCookie(res);
  return res.json({ message: 'Logout erfolgreich.' });
}

// GET /api/auth/me  (hinter authenticate)
async function me(req, res, next) {
  try {
    const user = await userRepository.findById(req.userId);

    if (!user) {
      clearSessionCookie(res); // Konto gelöscht -> Cookie entwerten
      return res.status(401).json({ message: 'Benutzer nicht gefunden.' });
    }
    if (!user.is_approved) {
      clearSessionCookie(res); // Freigabe nachträglich entzogen
      return res
        .status(403)
        .json({ message: 'Dein Konto ist nicht (mehr) freigegeben.' });
    }

    const profile = await userRepository.buildProfile(user);
    return res.json({ user: profile });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, logout, me };
