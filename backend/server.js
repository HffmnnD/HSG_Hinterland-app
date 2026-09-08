const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
require('dotenv').config({ quiet: true });

// Initialisiert den Connection-Pool und prüft die DB-Verbindung.
require('./config/db');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// CLIENT_ORIGIN darf mehrere Origins enthalten (kommagetrennt), damit z. B.
// localhost und die LAN-IP fürs Handy-Testen gleichzeitig erlaubt sind.
const ALLOWED_ORIGINS = (
  process.env.CLIENT_ORIGIN || 'http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Ist die Origin des Requests vertrauenswürdig?
 * Erlaubt sind konfigurierte Origins und Same-Origin-Requests (letzteres
 * greift beim Zugriff über den Vite-Dev-Proxy, z. B. via LAN-IP).
 */
function isOriginAllowed(origin, req) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// Sicherheits-Header (u. a. X-Content-Type-Options, Referrer-Policy, HSTS).
// contentSecurityPolicy ist für eine reine JSON-API nicht nötig.
app.use(helmet({ contentSecurityPolicy: false }));

// credentials: true, damit der Browser den HttpOnly-Cookie mitsendet.
// Nur explizit erlaubte Origins – niemals pauschal jede Origin spiegeln,
// da sonst jede fremde Seite authentifizierte Requests stellen könnte.
app.use(
  cors((req, callback) => {
    const origin = req.header('Origin');
    // Requests ohne Origin (curl, Server-zu-Server) zulassen.
    const allowed = !origin || isOriginAllowed(origin, req);
    callback(
      allowed ? null : new Error(`Origin nicht erlaubt: ${origin}`),
      { origin: allowed, credentials: true }
    );
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// CSRF-Schutz (zusätzlich zu SameSite=Lax): zustandsändernde Requests müssen
// von einer erlaubten Origin kommen. Requests ganz ohne Origin/Referer
// (curl, Postman) tragen kein Browser-Cookie-Risiko und bleiben erlaubt.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin || isOriginAllowed(origin, req)) return next();

  return res.status(403).json({ message: 'Ungültige Origin.' });
});

// Test-Endpunkt
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend verbindung steht!' });
});

// Auth-Routen (inkl. Rate-Limiting auf Login/Registrierung)
app.use('/api/auth', authRoutes);

// Admin-Routen (RBAC: nur Rolle `admin`)
app.use('/api/admin', adminRoutes);

// 404 für unbekannte API-Pfade – liefert JSON statt HTML.
app.use((req, res) => {
  res.status(404).json({ message: 'Endpunkt nicht gefunden.' });
});

// Zentrale Fehlerbehandlung: verhindert, dass Stacktraces oder interne
// Fehlermeldungen an den Client gelangen.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && /Origin nicht erlaubt/.test(err.message)) {
    return res.status(403).json({ message: 'Origin nicht erlaubt.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Anfrage zu groß.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'Ungültiges JSON im Request-Body.' });
  }

  console.error('Unbehandelter Fehler:', err);
  return res.status(500).json({
    message: 'Interner Serverfehler.',
    ...(IS_PRODUCTION ? {} : { detail: err?.message }),
  });
});

const server = app.listen(PORT, () => {
  console.log(`Backend-Server läuft auf Port ${PORT}`);
  console.log(`Erlaubte Origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

// Letzte Sicherheitsnetze: nicht abgefangene Fehler protokollieren, statt den
// Prozess still sterben zu lassen.
process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Promise-Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Nicht abgefangene Exception:', err);
  server.close(() => process.exit(1));
});

module.exports = app;
