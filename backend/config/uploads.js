// Datei-Uploads (aktuell: Beitragsbilder der Vereins-News).
//
// Bilder liegen im Dateisystem unter backend/uploads/<unterordner>/, in der
// Datenbank steht nur der relative Pfad. Ausgeliefert werden sie über
// /api/uploads/<pfad> – bewusst unter dem /api-Präfix, damit der Vite-
// Dev-Proxy sie ohne Zusatzkonfiguration mitausliefert (same-origin, dadurch
// kein CORS und keine Cookie-Probleme beim Testen vom Handy).
//
// Schutzschichten beim Upload:
//   1. fileFilter      – nur erlaubte MIME-Typen kommen überhaupt auf die Platte
//   2. limits          – Größe, Anzahl Dateien UND Anzahl/Größe der Textfelder
//   3. filename        – Zufallsname + Endung aus der Whitelist (nie der Originalname)
//   4. Signaturprüfung – der Inhalt muss wirklich das behauptete Bildformat sein
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Wurzelverzeichnis aller Uploads (backend/uploads).
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
// Unterordner für News-Bilder.
const NEWS_SUBDIR = 'news';
// Öffentliches URL-Präfix (siehe server.js).
const PUBLIC_PREFIX = '/api/uploads';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Nur Bildformate, die Browser sicher darstellen (kein SVG – das kann Skripte
// enthalten). Die Tabelle bestimmt auch die Dateiendung: der Originalname ist
// frei wählbar und wird deshalb komplett verworfen.
//
// `signature` prüft zusätzlich den tatsächlichen Dateiinhalt (Magic Bytes).
// `offset`-Einträge erlauben Formate wie WEBP ("RIFF....WEBP").
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', { ext: '.jpg', signature: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] }],
  [
    'image/png',
    {
      ext: '.png',
      signature: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    },
  ],
  [
    'image/webp',
    {
      ext: '.webp',
      signature: [
        { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
        { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
      ],
    },
  ],
  // "GIF87a" / "GIF89a"
  ['image/gif', { ext: '.gif', signature: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }] }],
]);

// So viele Bytes reichen für alle oben definierten Signaturen.
const SIGNATURE_BYTES = 12;

/** Legt einen Upload-Unterordner an, falls er noch nicht existiert. */
function ensureDir(subdir) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Absoluter Pfad zu einem gespeicherten Bild – aber nur, wenn er **echt
 * innerhalb** von UPLOAD_ROOT liegt. Schützt davor, dass ein manipulierter
 * Datenbankwert ("../../config/.env", "/etc/passwd") aus dem
 * Upload-Verzeichnis ausbricht.
 *
 * @returns {string|null} null, wenn der Pfad ausserhalb liegt.
 */
function resolveInsideRoot(storedPath) {
  if (typeof storedPath !== 'string' || storedPath === '') return null;

  const root = path.resolve(UPLOAD_ROOT);
  const target = path.resolve(root, storedPath);

  // Muss ECHT unterhalb liegen – das Wurzelverzeichnis selbst ist kein Ziel.
  if (!target.startsWith(root + path.sep)) return null;
  return target;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      cb(null, ensureDir(NEWS_SUBDIR));
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    // Zufälliger Name + Endung aus dem geprüften MIME-Typ. Der Originalname
    // wird NICHT übernommen: er könnte Pfadanteile ("../"), Null-Bytes oder
    // eine irreführende Doppelendung ("bild.php.png") enthalten.
    const type = ALLOWED_IMAGE_TYPES.get(file.mimetype);
    if (!type) {
      // Kann nur passieren, wenn fileFilter umgangen wird – dann lieber
      // abbrechen als eine Datei mit unbekannter Endung abzulegen.
      return cb(new Error(`Unerwarteter MIME-Typ: ${file.mimetype}`));
    }
    return cb(null, `${crypto.randomBytes(16).toString('hex')}${type.ext}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    const err = new Error('Nur Bilder (JPG, PNG, WEBP, GIF) sind erlaubt.');
    err.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(err);
  }
  return cb(null, true);
}

/**
 * Middleware für ein einzelnes, optionales Bild im Feld `image`.
 *
 * Die Feld-Limits sind wichtig: `express.json({ limit })` greift bei
 * multipart/form-data NICHT. Ohne sie könnte ein (angemeldeter) Angreifer
 * beliebig viele Textfelder schicken, die multer alle in `req.body` puffert.
 * Fehler landen im zentralen Error-Handler (siehe describeUploadError).
 */
const uploadNewsImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    // title + content + etwas Reserve
    fields: 8,
    parts: 12,
    fieldNameSize: 100,
    // 64 KB decken 5000 Zeichen auch in UTF-8 mit 4-Byte-Zeichen ab.
    fieldSize: 64 * 1024,
  },
}).single('image');

/** Relativer Speicherpfad einer hochgeladenen Datei, z. B. "news/ab12.jpg". */
function relativePathFor(file) {
  return `${NEWS_SUBDIR}/${file.filename}`;
}

/**
 * Öffentliche URL zu einem gespeicherten Pfad.
 * @returns {string|null} null, wenn kein Bild hinterlegt ist.
 */
function publicUrlFor(storedPath) {
  if (!storedPath) return null;
  return `${PUBLIC_PREFIX}/${storedPath}`;
}

/** Beginnt `buffer` an `offset` mit genau diesen Bytes? */
function matchesBytes(buffer, { offset, bytes }) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

/**
 * Prüft, ob der Dateiinhalt wirklich zum angegebenen MIME-Typ passt.
 *
 * Der MIME-Typ im Upload stammt vom Client und ist frei wählbar – ohne diese
 * Prüfung liesse sich beliebiger Inhalt (z. B. ein PHP-Skript) als „.png"
 * ablegen. Ausgeliefert würde er zwar mit `image/png` und `nosniff`, also
 * nicht ausgeführt; trotzdem gehört solcher Inhalt gar nicht erst gespeichert.
 *
 * @returns {Promise<boolean>}
 */
async function hasValidImageSignature(storedPath, mimetype) {
  const type = ALLOWED_IMAGE_TYPES.get(mimetype);
  const absolute = resolveInsideRoot(storedPath);
  if (!type || !absolute) return false;

  let handle;
  try {
    handle = await fs.promises.open(absolute, 'r');
    const buffer = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SIGNATURE_BYTES, 0);
    const head = buffer.subarray(0, bytesRead);
    return type.signature.every((part) => matchesBytes(head, part));
  } catch (err) {
    console.error('Bildsignatur nicht lesbar:', storedPath, err.message);
    return false;
  } finally {
    await handle?.close();
  }
}

/**
 * Löscht eine hochgeladene Datei. Fehler werden bewusst nur protokolliert –
 * eine verwaiste Datei darf das Löschen des Beitrags nicht scheitern lassen.
 */
async function removeUpload(storedPath) {
  if (!storedPath) return;

  const target = resolveInsideRoot(storedPath);
  if (!target) {
    console.warn('Upload-Pfad ausserhalb des Upload-Verzeichnisses:', storedPath);
    return;
  }

  try {
    await fs.promises.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Bild konnte nicht gelöscht werden:', storedPath, err.message);
    }
  }
}

// Klartext-Meldungen für die Limit-Verletzungen von multer.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: () =>
    `Das Bild darf höchstens ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB groß sein.`,
  LIMIT_FILE_COUNT: () => 'Es ist nur ein Bild pro Beitrag erlaubt.',
  LIMIT_UNEXPECTED_FILE: () => 'Unerwartetes Datei-Feld.',
  LIMIT_FIELD_COUNT: () => 'Zu viele Formularfelder.',
  LIMIT_PART_COUNT: () => 'Zu viele Teile im Formular.',
  LIMIT_FIELD_KEY: () => 'Feldname zu lang.',
  LIMIT_FIELD_VALUE: () => 'Ein Formularfeld ist zu groß.',
};

/**
 * Übersetzt Upload-Fehler in eine Client-Antwort.
 *
 * Alle diese Fälle sind **Eingabefehler des Clients** (zu groß, falscher Typ,
 * kaputter multipart-Body – z. B. ein Null-Byte im Dateinamen) und müssen als
 * 4xx beantwortet werden. Ohne diese Zuordnung landeten sie im generischen
 * 500er, der ausserhalb der Produktion sogar die interne Fehlermeldung
 * mitschickt.
 *
 * @returns {{ status:number, message:string } | null} null = kein Upload-Fehler
 */
function describeUploadError(err) {
  if (!err) return null;

  if (err.code === 'UNSUPPORTED_FILE_TYPE') {
    return { status: 400, message: err.message };
  }

  if (err instanceof multer.MulterError) {
    const message = MULTER_MESSAGES[err.code]?.() ?? 'Ungültiger Datei-Upload.';
    return { status: err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message };
  }

  // busboy meldet kaputte multipart-Bodies als gewöhnlichen Error.
  if (
    typeof err.message === 'string' &&
    /malformed part header|unexpected end of (form|multipart)|missing content-type|boundary not found/i.test(
      err.message
    )
  ) {
    return { status: 400, message: 'Ungültiger Formular-Body (multipart).' };
  }

  return null;
}

module.exports = {
  UPLOAD_ROOT,
  PUBLIC_PREFIX,
  MAX_IMAGE_BYTES,
  uploadNewsImage,
  relativePathFor,
  publicUrlFor,
  hasValidImageSignature,
  removeUpload,
  describeUploadError,
};
