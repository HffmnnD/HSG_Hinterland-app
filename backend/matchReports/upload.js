// Datei-Upload der Spielberichte (PDF und Bilder).
//
// Baut auf den Mechanismen aus config/uploads.js auf (Wurzelordner,
// Signaturprüfung der Bilder, sicheres Löschen) und ergänzt PDF:
//   1. fileFilter      – nur PDF/JPG/PNG/WEBP kommen überhaupt auf die Platte
//   2. limits          – Größe, Anzahl Dateien und Textfelder
//   3. filename        – Zufallsname + Endung aus der Whitelist (nie der Originalname)
//   4. Signaturprüfung – der Inhalt muss wirklich das behauptete Format sein
//
// Die Dateien liegen in uploads/match-reports/. Dieser Ordner wird NICHT über
// /api/uploads ausgeliefert (Sperre in index.js), sondern nur über die
// Route mit Rechteprüfung – Spielberichte sind mannschaftsintern.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { UPLOAD_ROOT, hasValidImageSignature, removeUpload } = require('../config/uploads');

const SUBDIR = 'match-reports';
const MAX_FILE_BYTES = Number.parseInt(process.env.MATCH_REPORT_MAX_FILE_MB, 10) * 1024 * 1024 || 15 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const FILE_FIELD = 'files';

const ALLOWED = new Map([
  ['application/pdf', { ext: '.pdf', kind: 'pdf' }],
  ['image/jpeg', { ext: '.jpg', kind: 'image' }],
  ['image/png', { ext: '.png', kind: 'image' }],
  ['image/webp', { ext: '.webp', kind: 'image' }],
]);

// "%PDF-" – jede PDF-Datei beginnt so.
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const dir = path.join(UPLOAD_ROOT, SUBDIR);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const type = ALLOWED.get(file.mimetype);
    if (!type) return cb(new Error(`Unerwarteter MIME-Typ: ${file.mimetype}`));
    return cb(null, `${crypto.randomBytes(16).toString('hex')}${type.ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED.has(file.mimetype)) {
    const err = new Error('Erlaubt sind nur PDF-Dateien und Bilder (JPG, PNG, WEBP).');
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err);
  }
  return cb(null, true);
}

const multerUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_FILES_PER_REQUEST,
    fields: 12,
    parts: MAX_FILES_PER_REQUEST + 14,
    fieldNameSize: 100,
    fieldSize: 200 * 1024, // langer Berichtstext
  },
}).array(FILE_FIELD, MAX_FILES_PER_REQUEST);

const LIMIT_MESSAGES = {
  LIMIT_FILE_SIZE: `Eine Datei darf höchstens ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB groß sein.`,
  LIMIT_FILE_COUNT: `Höchstens ${MAX_FILES_PER_REQUEST} Dateien pro Upload.`,
  LIMIT_UNEXPECTED_FILE: 'Unerwartetes Datei-Feld.',
  LIMIT_FIELD_COUNT: 'Zu viele Formularfelder.',
  LIMIT_PART_COUNT: 'Zu viele Teile im Formular.',
  LIMIT_FIELD_KEY: 'Feldname zu lang.',
  LIMIT_FIELD_VALUE: 'Ein Formularfeld ist zu groß.',
};

/**
 * Middleware: nimmt die Dateien entgegen und beantwortet Upload-Fehler selbst
 * (mit passender Meldung für PDFs – die allgemeine Meldung spricht von Bildern).
 */
function receiveFiles(req, res, next) {
  multerUpload(req, res, async (err) => {
    if (!err) return next();
    // Bereits geschriebene Dateien dieses Requests wieder entfernen.
    await discard(req.files);
    if (err.code === 'UNSUPPORTED_FILE_TYPE') return res.status(400).json({ message: err.message });
    if (err instanceof multer.MulterError) {
      return res
        .status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ message: LIMIT_MESSAGES[err.code] ?? 'Ungültiger Datei-Upload.' });
    }
    return res.status(400).json({ message: 'Ungültiger Formular-Body (multipart).' });
  });
}

const relativePath = (file) => `${SUBDIR}/${file.filename}`;

/** Absoluter Pfad – nur, wenn er wirklich im Spielbericht-Ordner liegt. */
function resolveStored(storedPath) {
  if (typeof storedPath !== 'string' || !storedPath.startsWith(`${SUBDIR}/`)) return null;
  const root = path.resolve(UPLOAD_ROOT, SUBDIR);
  const target = path.resolve(UPLOAD_ROOT, storedPath);
  return target.startsWith(root + path.sep) ? target : null;
}

async function hasValidPdfSignature(storedPath) {
  const absolute = resolveStored(storedPath);
  if (!absolute) return false;
  let handle;
  try {
    handle = await fs.promises.open(absolute, 'r');
    const buffer = Buffer.alloc(PDF_SIGNATURE.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === buffer.length && PDF_SIGNATURE.every((byte, i) => buffer[i] === byte);
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

/** Prüft den Inhalt aller Dateien (Magic Bytes). */
async function verifyFiles(files) {
  for (const file of files) {
    const stored = relativePath(file);
    const ok =
      file.mimetype === 'application/pdf'
        ? await hasValidPdfSignature(stored)
        : await hasValidImageSignature(stored, file.mimetype);
    if (!ok) return false;
  }
  return true;
}

/** Entfernt die (noch nicht gespeicherten) Dateien eines Requests. */
async function discard(files) {
  for (const file of Array.isArray(files) ? files : []) {
    if (file?.filename) await removeUpload(relativePath(file));
  }
}

/** Anzeigename: nur sichere Zeichen, ohne Pfadanteile, gekürzt. */
function safeOriginalName(name) {
  const base = path.basename(String(name ?? '')).replace(/[^\p{L}\p{N} ._()-]/gu, '_');
  return base.slice(-160) || null;
}

module.exports = {
  SUBDIR,
  ALLOWED,
  MAX_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
  receiveFiles,
  verifyFiles,
  discard,
  relativePath,
  resolveStored,
  safeOriginalName,
  removeUpload,
};
