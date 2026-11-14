// Automatische Datensicherung – eingebunden in server.js mit
//   require('./backup').mount(app);
//
// Lastenheft 1.4: „Aus Nachverfolgbarkeitsgründen sollte die App in
// regelmäßigen Intervallen Backups erstellen."
//
// Gesichert wird die komplette Datenbank als SQL-Datei (gzip) nach
// backend/backups/. Bewusst in reinem JavaScript statt über mysqldump: läuft
// damit überall, wo die App läuft – auch unter Windows/XAMPP ohne PATH-Eintrag.
// Die Datei lässt sich mit jedem MySQL-Client wieder einspielen:
//   gunzip -c hsg-backup-….sql.gz | mysql -u root hsg_hinterland
//
// Hochgeladene Dateien (backend/uploads/) sind NICHT enthalten – der Ordner
// gehört in die normale Dateisicherung des Servers.
//
// Einstellungen (.env):
//   BACKUP_ENABLED=true          automatische Sicherung an/aus
//   BACKUP_INTERVAL_HOURS=24     Abstand zwischen zwei Sicherungen
//   BACKUP_KEEP=14               so viele Sicherungen bleiben liegen
//   BACKUP_DIR=                  anderer Zielordner (Standard: backend/backups)
//
//   GET    /api/admin/backups             Liste + Einstellungen   (backups.manage)
//   POST   /api/admin/backups             jetzt sichern
//   GET    /api/admin/backups/:name       herunterladen
//   DELETE /api/admin/backups/:name       löschen
const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { once } = require('events');
const rateLimit = require('express-rate-limit');

const pool = require('../config/db');
const { authenticate, requirePermission, forbidWhileActingAs } = require('../middleware/authMiddleware');

const ENABLED = process.env.BACKUP_ENABLED !== 'false';
const INTERVAL_HOURS = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS) || 24);
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(__dirname, '..', 'backups');
const NAME_PATTERN = /^hsg-backup-\d{8}-\d{6}\.sql\.gz$/;
const CHECK_EVERY_MS = 15 * 60 * 1000;
const BATCH = 500;

let running = null;
let lastError = null;

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function list() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((name) => NAME_PATTERN.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(DIR, name));
      return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

async function write(out, text) {
  if (!out.write(text)) await once(out, 'drain');
}

async function dump(target) {
  const conn = await pool.getConnection();
  const gzip = zlib.createGzip();
  const file = fs.createWriteStream(target, { mode: 0o600 });
  gzip.pipe(file);
  try {
    // Ein gemeinsamer Lesestand für alle Tabellen – auch wenn währenddessen
    // jemand schreibt, passt die Sicherung in sich zusammen.
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

    await write(gzip, `-- HSG Hinterland – Datensicherung vom ${new Date().toISOString()}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);
    const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    for (const entry of tables) {
      const table = Object.values(entry)[0];
      const id = conn.escapeId(table);
      const [[create]] = await conn.query(`SHOW CREATE TABLE ${id}`);
      await write(gzip, `DROP TABLE IF EXISTS ${id};\n${create['Create Table']};\n\n`);

      const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM ${id}`);
      for (let offset = 0; offset < total; offset += BATCH) {
        const [rows] = await conn.query({
          sql: `SELECT * FROM ${id} LIMIT ? OFFSET ?`,
          rowsAsArray: true,
          dateStrings: true,
          // JSON-Spalten als Text sichern, nicht als Objekt.
          typeCast: (field, next) => (field.type === 'JSON' ? field.string('utf8') : next()),
        }, [BATCH, offset]);
        if (rows.length === 0) break;
        const values = rows.map((row) => `(${row.map((value) => conn.escape(value)).join(',')})`).join(',\n');
        await write(gzip, `INSERT INTO ${id} VALUES\n${values};\n`);
      }
      await write(gzip, '\n');
    }
    await write(gzip, 'SET FOREIGN_KEY_CHECKS = 1;\n');
    await conn.query('COMMIT');
  } finally {
    conn.release();
    gzip.end();
    await once(file, 'close');
  }
}

/** Sicherung erstellen (nie zwei gleichzeitig) und alte aufräumen. */
function create() {
  if (running) return running;
  running = (async () => {
    fs.mkdirSync(DIR, { recursive: true });
    const name = `hsg-backup-${stamp()}.sql.gz`;
    const target = path.join(DIR, name);
    try {
      await dump(target);
      lastError = null;
      for (const old of list().slice(KEEP)) fs.rmSync(path.join(DIR, old.name), { force: true });
      return list().find((entry) => entry.name === name);
    } catch (err) {
      fs.rmSync(target, { force: true });
      lastError = err.message;
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

function isDue() {
  const [latest] = list();
  return !latest || Date.now() - new Date(latest.createdAt).getTime() >= INTERVAL_HOURS * 3600 * 1000;
}

function startScheduler() {
  if (!ENABLED) return;
  const tick = () => {
    if (!isDue()) return;
    create()
      .then((entry) => console.log(`Datensicherung erstellt: ${entry.name}`))
      .catch((err) => console.error('Datensicherung fehlgeschlagen:', err.message));
  };
  // Erst nach dem Start prüfen, dann regelmäßig. unref: hält den Prozess nicht am Leben.
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, CHECK_EVERY_MS).unref();
}

// ---------------------------------------------------------------- Routen --

const router = express.Router();
router.use(authenticate, forbidWhileActingAs, requirePermission('backups.manage'));

const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Sicherungen in kurzer Zeit. Bitte kurz warten.' },
});

const status = () => ({
  backups: list(),
  settings: { enabled: ENABLED, intervalHours: INTERVAL_HOURS, keep: KEEP },
  lastError,
});

/** Nur Dateinamen aus dem eigenen Muster – nie ein Pfad aus der Anfrage. */
const resolveName = (name) => (NAME_PATTERN.test(name) ? path.join(DIR, name) : null);

router.get('/', (req, res) => res.json(status()));

router.post('/', createLimiter, async (req, res, next) => {
  try {
    await create();
    return res.status(201).json({ message: 'Sicherung erstellt.', ...status() });
  } catch (err) {
    return next(err);
  }
});

router.get('/:name', (req, res) => {
  const target = resolveName(req.params.name);
  if (!target || !fs.existsSync(target)) return res.status(404).json({ message: 'Sicherung nicht gefunden.' });
  res.set('Cache-Control', 'no-store');
  return res.download(target, req.params.name);
});

router.delete('/:name', (req, res) => {
  const target = resolveName(req.params.name);
  if (!target || !fs.existsSync(target)) return res.status(404).json({ message: 'Sicherung nicht gefunden.' });
  fs.rmSync(target, { force: true });
  return res.json({ message: 'Sicherung gelöscht.', ...status() });
});

function mount(app) {
  app.use('/api/admin/backups', router);
  startScheduler();
}

module.exports = { mount, create, list };
