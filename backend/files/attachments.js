// Dateianhänge (Dokumente, Bilder, Videos) für Infothek und News.
//
//   const files = createAttachmentStore({ subdir: 'library' });
//   router.post('/', files.receive, async (req, res) => { … files.verify(req.files) … });
//
// Dieselben Schutzschichten wie bei Bildern (config/uploads.js) und
// Spielberichten (matchReports/upload.js):
//   1. fileFilter      – nur Typen aus der Whitelist kommen auf die Platte
//   2. limits          – Größe und Anzahl
//   3. filename        – Zufallsname + Endung aus der Whitelist, nie der Originalname
//   4. Signaturprüfung – der Inhalt muss zum behaupteten Typ passen
//   5. Auslieferung    – nur über eine Route mit Rechteprüfung (send), nie über
//                        /api/uploads. Alles außer Bild, PDF und Video wird als
//                        Download ausgeliefert, nie im Browser geöffnet.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { UPLOAD_ROOT, removeUpload } = require('../config/uploads');

const MB = 1024 * 1024;
const envMb = (name, fallback) => (Number.parseInt(process.env[name], 10) || fallback) * MB;

const MAX_DOCUMENT_BYTES = envMb('ATTACHMENT_MAX_FILE_MB', 25);
const MAX_VIDEO_BYTES = envMb('ATTACHMENT_MAX_VIDEO_MB', 200);

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, pptx, odt sind ZIP-Archive
const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // doc, xls, ppt (altes Office-Format)

// kind: image | pdf | video | document. `inline` = darf im Browser angezeigt werden.
const TYPES = new Map([
  ['application/pdf', { ext: '.pdf', kind: 'pdf', inline: true, signature: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }] }],
  ['image/jpeg', { ext: '.jpg', kind: 'image', inline: true, signature: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] }],
  ['image/png', { ext: '.png', kind: 'image', inline: true, signature: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }] }],
  ['image/webp', { ext: '.webp', kind: 'image', inline: true, signature: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }] }],
  ['video/mp4', { ext: '.mp4', kind: 'video', inline: true, signature: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }] }],
  ['video/quicktime', { ext: '.mov', kind: 'video', inline: true, signature: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }] }],
  ['video/webm', { ext: '.webm', kind: 'video', inline: true, signature: [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }] }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { ext: '.docx', kind: 'document', signature: [{ offset: 0, bytes: ZIP }] }],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { ext: '.xlsx', kind: 'document', signature: [{ offset: 0, bytes: ZIP }] }],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', { ext: '.pptx', kind: 'document', signature: [{ offset: 0, bytes: ZIP }] }],
  ['application/vnd.oasis.opendocument.text', { ext: '.odt', kind: 'document', signature: [{ offset: 0, bytes: ZIP }] }],
  ['application/msword', { ext: '.doc', kind: 'document', signature: [{ offset: 0, bytes: OLE }] }],
  ['application/vnd.ms-excel', { ext: '.xls', kind: 'document', signature: [{ offset: 0, bytes: OLE }] }],
  ['application/vnd.ms-powerpoint', { ext: '.ppt', kind: 'document', signature: [{ offset: 0, bytes: OLE }] }],
  // Reiner Text hat keine Signatur – geprüft wird, dass keine Binärdaten drinstecken.
  ['text/plain', { ext: '.txt', kind: 'document', text: true }],
  ['text/csv', { ext: '.csv', kind: 'document', text: true }],
]);

const TYPE_HINT = 'Erlaubt sind PDF, Bilder (JPG, PNG, WEBP), Office-Dokumente, Textdateien und Videos (MP4, MOV, WEBM).';

const kindOf = (mimeType) => TYPES.get(mimeType)?.kind ?? 'document';

/** Anzeigename: nur sichere Zeichen, ohne Pfadanteile, gekürzt. */
function safeOriginalName(name) {
  // multer liest Dateinamen als latin1 – deutsche Umlaute kämen sonst kaputt an.
  let text = String(name ?? '');
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    if (!decoded.includes('�')) text = decoded;
  } catch {
    // Name bleibt, wie er ist.
  }
  const base = path.basename(text).replace(/[^\p{L}\p{N} ._()-]/gu, '_');
  return base.slice(-160) || null;
}

async function readHead(absolute, length) {
  let handle;
  try {
    handle = await fs.promises.open(absolute, 'r');
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

/**
 * @param {{ subdir:string, maxFiles?:number, fieldName?:string }} options
 */
function createAttachmentStore({ subdir, maxFiles = 10, fieldName = 'files' }) {
  const root = path.resolve(UPLOAD_ROOT, subdir);

  const storage = multer.diskStorage({
    destination(req, file, cb) {
      try {
        fs.mkdirSync(root, { recursive: true });
        cb(null, root);
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      const type = TYPES.get(file.mimetype);
      if (!type) return cb(new Error(`Unerwarteter MIME-Typ: ${file.mimetype}`));
      return cb(null, `${crypto.randomBytes(16).toString('hex')}${type.ext}`);
    },
  });

  const multerUpload = multer({
    storage,
    fileFilter(req, file, cb) {
      if (!TYPES.has(file.mimetype)) {
        const err = new Error(`Dieser Dateityp wird nicht unterstützt. ${TYPE_HINT}`);
        err.code = 'UNSUPPORTED_FILE_TYPE';
        return cb(err);
      }
      return cb(null, true);
    },
    limits: {
      fileSize: Math.max(MAX_DOCUMENT_BYTES, MAX_VIDEO_BYTES),
      files: maxFiles,
      fields: 30,
      parts: maxFiles + 32,
      fieldNameSize: 100,
      fieldSize: 64 * 1024,
    },
  }).array(fieldName, maxFiles);

  const relativePath = (file) => `${subdir}/${file.filename}`;

  /** Absoluter Pfad – nur, wenn er wirklich in diesem Ordner liegt. */
  function resolveStored(storedPath) {
    if (typeof storedPath !== 'string' || !storedPath.startsWith(`${subdir}/`)) return null;
    const target = path.resolve(UPLOAD_ROOT, storedPath);
    return target.startsWith(root + path.sep) ? target : null;
  }

  /** Entfernt die (noch nicht gespeicherten) Dateien eines Requests. */
  async function discard(files) {
    for (const file of Array.isArray(files) ? files : []) {
      if (file?.filename) await removeUpload(relativePath(file));
    }
  }

  const LIMIT_MESSAGES = {
    LIMIT_FILE_SIZE: `Eine Datei ist zu groß (Videos bis ${Math.round(MAX_VIDEO_BYTES / MB)} MB, alles andere bis ${Math.round(MAX_DOCUMENT_BYTES / MB)} MB).`,
    LIMIT_FILE_COUNT: `Höchstens ${maxFiles} Dateien pro Upload.`,
    LIMIT_UNEXPECTED_FILE: 'Unerwartetes Datei-Feld.',
  };

  /** Middleware: nimmt die Dateien entgegen und beantwortet Upload-Fehler selbst. */
  function receive(req, res, next) {
    multerUpload(req, res, async (err) => {
      if (!err) return next();
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

  /**
   * Prüft Größe je Dateiart und den tatsächlichen Inhalt.
   * @returns {Promise<{ok:true}|{ok:false,message:string}>}
   */
  async function verify(files) {
    for (const file of files) {
      const type = TYPES.get(file.mimetype);
      const name = safeOriginalName(file.originalname) ?? 'Die Datei';
      if (!type) return { ok: false, message: TYPE_HINT };
      if (type.kind !== 'video' && file.size > MAX_DOCUMENT_BYTES) {
        return { ok: false, message: `„${name}" ist zu groß (höchstens ${Math.round(MAX_DOCUMENT_BYTES / MB)} MB).` };
      }
      const absolute = resolveStored(relativePath(file));
      const head = absolute ? await readHead(absolute, type.text ? 4096 : 16) : null;
      if (!head) return { ok: false, message: `„${name}" konnte nicht gelesen werden.` };
      const valid = type.text
        ? !head.includes(0)
        : type.signature.every((part) => part.bytes.every((byte, i) => head[part.offset + i] === byte));
      if (!valid) return { ok: false, message: `„${name}" ist keine gültige Datei dieses Typs.` };
    }
    return { ok: true };
  }

  /** Dateien -> Zeilen für die Datenbank. */
  const records = (files) =>
    files.map((file) => ({
      path: relativePath(file),
      mimeType: file.mimetype,
      originalName: safeOriginalName(file.originalname),
      sizeBytes: file.size,
    }));

  /**
   * Liefert eine gespeicherte Datei aus (nach der Rechteprüfung der Route).
   * @param {{ file_path:string, mime_type:string, original_name:string|null, id:number }} file
   */
  function send(req, res, file) {
    const absolute = file ? resolveStored(file.file_path) : null;
    if (!absolute || !fs.existsSync(absolute)) {
      return res.status(404).json({ message: 'Datei nicht gefunden.' });
    }
    const type = TYPES.get(file.mime_type);
    const inline = Boolean(type?.inline) && req.query.download !== '1';
    const name = (file.original_name || `datei-${file.id}${type?.ext ?? ''}`).replace(/"/g, '');
    res.set({
      'Content-Type': type ? file.mime_type : 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    // sendFile beantwortet auch Range-Anfragen – nötig zum Spulen in Videos.
    return res.sendFile(absolute);
  }

  /** Sperrt den Ordner in der allgemeinen Auslieferung /api/uploads. */
  function blockStatic(app) {
    app.use(`/api/uploads/${subdir}`, (req, res) => {
      res.status(404).json({ message: 'Nicht gefunden.' });
    });
  }

  return { subdir, receive, verify, discard, records, send, blockStatic, resolveStored, removeUpload };
}

module.exports = { createAttachmentStore, kindOf, safeOriginalName, TYPE_HINT, MAX_DOCUMENT_BYTES, MAX_VIDEO_BYTES };
