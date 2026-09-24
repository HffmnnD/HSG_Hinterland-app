// Auth-Controller: Registrierung, Login, Logout, Auth-Status und das eigene
// Konto (Design, Onboarding, Mannschaftswahl, Passwort).
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
const {
  validateRegistration,
  validateTheme,
  validateOnboarding,
  validateSelfRelations,
  validatePasswordChange,
} = require('../utils/validation');

// Die Registrierung legt das Konto an, gibt aber KEINE Sitzung aus: bis zur
// Freigabe durch die Verwaltung gibt es nichts zu sehen. Die Meldung sagt das
// deutlich, damit niemand vergeblich auf der Anmeldeseite herumprobiert.
const REGISTER_OK_MESSAGE =
  'Konto angelegt. Sobald die Vereinsverwaltung es freigegeben hat, kannst du dich anmelden – du wirst dann durch die Einrichtung geführt.';
const BAD_CREDENTIALS_MESSAGE = 'E-Mail-Adresse oder Passwort ist falsch.';
// `is_approved = 0` heißt entweder „noch nicht freigegeben" (neu registriert)
// oder „gesperrt". `approved_at` unterscheidet beides – und damit auch die
// Meldung, denn die beiden Fälle brauchen verschiedene nächste Schritte.
const AWAITING_APPROVAL_MESSAGE =
  'Dein Konto wartet noch auf die Freigabe durch die Vereinsverwaltung. Du wirst benachrichtigt, sobald es freigeschaltet ist.';
const ACCOUNT_LOCKED_MESSAGE =
  'Dieses Konto wurde gesperrt. Bitte wende dich an einen Admin.';

// Echter Hash eines Dummy-Passworts. Wird beim Login gegen nicht existierende
// Konten verglichen, damit die Antwortzeit nicht verrät, ob es die
// E-Mail-Adresse gibt (Timing-basierte User-Enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-attack-dummy-password',
  SALT_ROUNDS
);

/** Passende Meldung für ein Konto ohne Freigabe. */
function blockedMessage(user) {
  return user.approved_at ? ACCOUNT_LOCKED_MESSAGE : AWAITING_APPROVAL_MESSAGE;
}

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

    await userRepository.createAccount({
      firstName: input.account.firstName,
      lastName: input.account.lastName,
      email: input.account.email,
      passwordHash,
    });

    // Bewusst OHNE Profil in der Antwort: Das Konto ist noch nicht
    // freigegeben, es gibt also keine Sitzung und nichts, was der Client damit
    // anfangen könnte.
    return res.status(201).json({ message: REGISTER_OK_MESSAGE });
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
    // Keine neue Sitzung ohne Freigabe – egal ob noch offen oder gesperrt.
    if (!user.is_approved) {
      return res.status(403).json({ message: blockedMessage(user) });
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
      clearSessionCookie(res); // nachträglich gesperrt -> Sitzung beenden
      return res.status(403).json({ message: blockedMessage(user) });
    }

    const profile = await userRepository.buildProfile(user);
    return res.json({ user: profile });
  } catch (err) {
    return next(err);
  }
}

// --- Eigenes Konto ----------------------------------------------------------

/**
 * Antwort aller Konto-Endpunkte: Meldung + frisches Profil.
 *
 * Das Profil wird immer mitgeschickt, damit der Client nach einer Änderung
 * nicht noch einmal /api/auth/me abfragen muss – eine Anfrage weniger auf
 * genau dem Weg, den man am Handy am häufigsten geht.
 */
async function respondWithProfile(res, userId, message, status = 200) {
  const profile = await userRepository.getFullProfile(userId);
  return res.status(status).json({ message, user: profile });
}

// PATCH /api/auth/me/theme   Body: { theme: 'system' | 'light' | 'dark' }
//
// Eigener, schlanker Endpunkt für den Umschalter in der Kopfzeile: Er soll
// sofort reagieren und nicht die ganze Mannschaftswahl mitschicken müssen.
async function setTheme(req, res, next) {
  try {
    const check = validateTheme(req.body?.theme);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    await userRepository.setTheme(req.userId, check.theme);
    return res.json({ message: 'Design gespeichert.', theme: check.theme });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/me/onboarding
//   Body: { theme?, teams?: [{ teamId, relationType }] }
//
// Abschluss des Assistenten beim ersten Login. Idempotent: ein zweiter Aufruf
// überschreibt die Angaben, statt einen Fehler zu werfen – ein doppelt
// geklickter Knopf soll niemanden aussperren.
async function completeOnboarding(req, res, next) {
  try {
    const check = await validateOnboarding(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    await userRepository.completeOnboarding(req.userId, {
      theme: check.theme,
      relations: check.relations,
    });

    const pending = check.relations.filter((rel) => rel.relationType !== 'fan');
    return respondWithProfile(
      res,
      req.userId,
      pending.length > 0
        ? 'Alles gespeichert. Deine Spieler:in- und Trainer:in-Anfragen bestätigt noch der/die jeweilige Trainer:in.'
        : 'Alles gespeichert. Viel Spaß mit der Vereins-App!'
    );
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/auth/me/preferences
//   Body: { theme?, teams?: [{ teamId, relationType }] }
//
// Dieselben Angaben wie im Onboarding, später unter „Mein Konto" änderbar.
// `teams` ist die VOLLSTÄNDIGE neue Wahl – nicht mitgeschickt heißt
// „unverändert lassen", eine leere Liste heißt „alle Zuordnungen aufheben".
async function updatePreferences(req, res, next) {
  try {
    const { theme, teams } = req.body || {};
    if (theme === undefined && teams === undefined) {
      return res
        .status(400)
        .json({ message: 'Keine Änderungen übergeben (theme oder teams).' });
    }

    const patch = {};

    if (theme !== undefined) {
      const themeCheck = validateTheme(theme);
      if (!themeCheck.ok) {
        return res.status(themeCheck.status).json({ message: themeCheck.message });
      }
      patch.theme = themeCheck.theme;
    }

    if (teams !== undefined) {
      const relationCheck = await validateSelfRelations(teams);
      if (!relationCheck.ok) {
        return res
          .status(relationCheck.status)
          .json({ message: relationCheck.message });
      }
      patch.relations = relationCheck.relations;
    }

    await userRepository.updateOwnPreferences(req.userId, patch);
    return respondWithProfile(res, req.userId, 'Einstellungen gespeichert.');
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/me/password   Body: { currentPassword, newPassword }
//
// Das aktuelle Passwort ist Pflicht: Ein offen gebliebener Browser darf nicht
// ausreichen, um das Konto zu übernehmen.
async function changePassword(req, res, next) {
  try {
    const check = validatePasswordChange(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    const currentHash = await userRepository.getPasswordHash(req.userId);
    if (!currentHash) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Benutzer nicht gefunden.' });
    }
    if (!(await bcrypt.compare(check.currentPassword, currentHash))) {
      return res
        .status(401)
        .json({ message: 'Das aktuelle Passwort ist falsch.' });
    }

    const passwordHash = await bcrypt.hash(check.newPassword, SALT_ROUNDS);
    await userRepository.updatePassword(req.userId, passwordHash);

    // Die Sitzung bleibt bestehen: Das Token hängt am Konto, nicht am
    // Passwort, und wer gerade selbst das Passwort geändert hat, soll nicht
    // aus der App fallen.
    return res.json({ message: 'Passwort geändert.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  logout,
  me,
  setTheme,
  completeOnboarding,
  updatePreferences,
  changePassword,
};
