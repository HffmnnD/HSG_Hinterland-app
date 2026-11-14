// App-Einstellungen für das Erscheinungsbild – eingebunden in server.js mit
//   require('./branding').mount(app);
// Braucht Migration 018 (app_settings) und für lange Texte Migration 035.
//
// Öffentlich (auch ohne Anmeldung, die Login-Seite braucht sie):
//   GET    /api/branding                    Logo, App-Symbol, Login-Bild und -Sprüche
//   GET    /api/branding/manifest.webmanifest   PWA-Manifest mit dem eingestellten Symbol
//   GET    /api/branding/files/:kind        Bilddatei (logo | icon192 | icon512 | login)
//
// Verwaltung (Recht settings.manage):
//   PATCH  /api/branding                    { loginTitle?, loginText? } – leer = ausblenden
//   POST   /api/branding/files/:kind        Bild hochladen (multipart, Feld „file")
//   DELETE /api/branding/files/:kind        Bild entfernen (zurück zum Standard)
//
// Die Bilder liegen unter backend/uploads/branding/. Das App-Symbol in 192 und
// 512 Pixeln rechnet die Verwaltungsseite im Browser aus dem Logo aus.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const pool = require('../config/db');
const { authenticate, requirePermission } = require('../middleware/authMiddleware');
const { UPLOAD_ROOT } = require('../config/uploads');

const SUBDIR = 'branding';
const DIR = path.join(UPLOAD_ROOT, SUBDIR);
const MAX_BYTES = 8 * 1024 * 1024;

const KINDS = {
  logo: 'branding_logo',
  icon192: 'branding_icon_192',
  icon512: 'branding_icon_512',
  login: 'branding_login_image',
};
const TEXTS = {
  loginTitle: { key: 'branding_login_title', max: 120 },
  loginText: { key: 'branding_login_text', max: 400 },
};
// Standard, solange nichts eingestellt ist. Ein leerer Text blendet aus.
const DEFAULT_TEXTS = {
  loginTitle: 'Dein Verein. Alles an einem Ort.',
  loginText: 'Training, Spiele und Dienste deiner Mannschaft – auf dem Handy wie am Rechner.',
};

// Erlaubte Bildformate mit Dateisignatur (kein SVG: könnte Skripte enthalten).
const TYPES = {
  'image/png': { ext: '.png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: '.jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: '.webp', check: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};

const CACHE_MS = 30 * 1000;
let cache = null;
let cachedAt = 0;

async function loadRaw() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const keys = [...Object.values(KINDS), ...Object.values(TEXTS).map((t) => t.key)];
  const values = {};
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)',
      [keys]
    );
    for (const row of rows) values[row.setting_key] = row.setting_value;
  } catch (err) {
    console.error('Branding: Einstellungen nicht lesbar:', err.message);
  }
  cache = values;
  cachedAt = Date.now();
  return values;
}

async function save(key, value, userId) {
  if (value === null) {
    await pool.query('DELETE FROM app_settings WHERE setting_key = ?', [key]);
  } else {
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, value, userId]
    );
  }
  cache = null;
}

/** Öffentliche Sicht: URLs mit Versionsanhang, damit Browser neu laden. */
async function present() {
  const raw = await loadRaw();
  const url = (kind) => {
    const stored = raw[KINDS[kind]];
    if (!stored) return null;
    return `/api/branding/files/${kind}?v=${encodeURIComponent(path.basename(stored, path.extname(stored)).slice(-8))}`;
  };
  const text = (name) => (raw[TEXTS[name].key] !== undefined ? raw[TEXTS[name].key] : DEFAULT_TEXTS[name]);
  return {
    logoUrl: url('logo'),
    icon192Url: url('icon192'),
    icon512Url: url('icon512'),
    loginImageUrl: url('login'),
    loginTitle: text('loginTitle'),
    loginText: text('loginText'),
  };
}

function absoluteOf(stored) {
  if (!stored) return null;
  const absolute = path.resolve(UPLOAD_ROOT, stored);
  return absolute.startsWith(path.resolve(DIR) + path.sep) ? absolute : null;
}

async function removeFile(stored) {
  const absolute = absoluteOf(stored);
  if (!absolute) return;
  await fs.promises.unlink(absolute).catch(() => {});
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 2 },
  fileFilter: (req, file, cb) => cb(null, Boolean(TYPES[file.mimetype])),
}).single('file');

function receive(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res
      .status(tooBig ? 413 : 400)
      .json({ message: tooBig ? 'Das Bild darf höchstens 8 MB groß sein.' : 'Ungültiger Datei-Upload.' });
  });
}

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    return res.json(await present());
  } catch (err) {
    return next(err);
  }
});

router.get('/manifest.webmanifest', async (req, res, next) => {
  try {
    const branding = await present();
    const icons = branding.icon512Url
      ? [
          { src: branding.icon192Url ?? branding.icon512Url, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: branding.icon512Url, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: branding.icon512Url, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ];
    res.set({ 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.send(
      JSON.stringify({
        name: 'HSG Hinterland App',
        short_name: 'HSG Hinterland',
        description: 'Vereins-App der HSG Hinterland',
        lang: 'de',
        theme_color: '#2e2e2e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons,
      })
    );
  } catch (err) {
    return next(err);
  }
});

router.get('/files/:kind', async (req, res, next) => {
  try {
    const key = KINDS[req.params.kind];
    const stored = key ? (await loadRaw())[key] : null;
    const absolute = absoluteOf(stored);
    if (!absolute || !fs.existsSync(absolute)) return res.status(404).json({ message: 'Nicht gefunden.' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' });
    return res.sendFile(absolute);
  } catch (err) {
    return next(err);
  }
});

router.patch('/', authenticate, requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const body = req.body || {};
    let changed = false;
    for (const [name, def] of Object.entries(TEXTS)) {
      if (body[name] === undefined) continue;
      if (body[name] !== null && typeof body[name] !== 'string') {
        return res.status(400).json({ message: `${name} muss Text sein.` });
      }
      // null = Standard wiederherstellen, '' = ausblenden
      const value = body[name] === null ? null : body[name].trim().slice(0, def.max);
      await save(def.key, value, req.userId);
      changed = true;
    }
    if (!changed) return res.status(400).json({ message: 'Keine Änderungen übergeben.' });
    return res.json({ message: 'Gespeichert.', branding: await present() });
  } catch (err) {
    return next(err);
  }
});

router.post('/files/:kind', authenticate, requirePermission('settings.manage'), receive, async (req, res, next) => {
  try {
    const key = KINDS[req.params.kind];
    if (!key) return res.status(404).json({ message: 'Unbekanntes Bild.' });
    const file = req.file;
    const type = file ? TYPES[file.mimetype] : null;
    if (!file || !type) return res.status(400).json({ message: 'Bitte ein PNG-, JPG- oder WebP-Bild wählen.' });
    if (!type.check(file.buffer)) return res.status(400).json({ message: 'Die Datei ist kein gültiges Bild.' });

    await fs.promises.mkdir(DIR, { recursive: true });
    const name = `${req.params.kind}-${crypto.randomBytes(8).toString('hex')}${type.ext}`;
    await fs.promises.writeFile(path.join(DIR, name), file.buffer);
    const previous = (await loadRaw())[key];
    await save(key, `${SUBDIR}/${name}`, req.userId);
    await removeFile(previous);
    return res.status(201).json({ message: 'Bild gespeichert.', branding: await present() });
  } catch (err) {
    return next(err);
  }
});

router.delete('/files/:kind', authenticate, requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const key = KINDS[req.params.kind];
    if (!key) return res.status(404).json({ message: 'Unbekanntes Bild.' });
    const previous = (await loadRaw())[key];
    await save(key, null, req.userId);
    await removeFile(previous);
    return res.json({ message: 'Bild entfernt.', branding: await present() });
  } catch (err) {
    return next(err);
  }
});

function mount(app) {
  // Die Bilder nur über /api/branding/files ausliefern, nicht über /api/uploads.
  app.use(`/api/uploads/${SUBDIR}`, (req, res) => res.status(404).json({ message: 'Nicht gefunden.' }));
  app.use('/api/branding', router);
}

module.exports = { mount, present };
