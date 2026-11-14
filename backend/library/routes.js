// /api/library – Dokumente unter Verein → Infos (scope=board).
//
//   GET    /overview                         sichtbare Bereiche der Person
//   GET    /entries?scope=&teamId=           Einträge eines Bereichs
//   POST   /entries?scope=&teamId=           anlegen (multipart: Felder + files[])
//   PATCH  /entries/:id                      ändern (JSON)
//   DELETE /entries/:id                      löschen (samt Dateien)
//   POST   /entries/:id/files                Dateien ergänzen (multipart)
//   DELETE /entries/:id/files/:fileId        eine Datei entfernen
//   GET    /entries/:id/files/:fileId        Datei ansehen (?download=1 lädt herunter)
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const pool = require('../config/db');
const { authenticate, forbidWhileActingAs } = require('../middleware/authMiddleware');
const { parseId } = require('../utils/validation');
const { createAttachmentStore, kindOf } = require('../files/attachments');
const access = require('./access');

const files = createAttachmentStore({ subdir: 'library' });
const MAX_FILES_PER_ENTRY = 30;

const router = express.Router();
router.use(authenticate);

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 80,
  keyGenerator: (req) => `user:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Zu viele Uploads in kurzer Zeit. Bitte später erneut versuchen.' },
});

const NOT_FOUND = { message: 'Eintrag nicht gefunden.' };

// ------------------------------------------------------------ Eingaben --

function cleanText(value, max) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\r\n/g, '\n').trim();
  return text ? text.slice(0, max) : null;
}

/** Nur http(s)-Adressen – nie javascript: oder data:. */
function cleanUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return { ok: true, value: null };
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return { ok: true, value: url.toString().slice(0, 500) };
  } catch {
    return { ok: false };
  }
}

const truthy = (value) => value === true || value === 'true' || value === '1' || value === 1;

function validate(body, partial = false) {
  const data = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('title')) {
    const title = cleanText(body.title, 160);
    if (!title) return { ok: false, message: 'Bitte einen Titel angeben.' };
    data.title = title;
  }
  if (!partial || has('body')) data.body = cleanText(body.body, 20000);
  if (!partial || has('category')) data.category = cleanText(body.category, 60);
  if (!partial || has('isPinned')) data.is_pinned = truthy(body.isPinned) ? 1 : 0;
  if (!partial || has('linkUrl')) {
    const link = cleanUrl(body.linkUrl);
    if (!link.ok) return { ok: false, message: 'Der Link ist keine gültige Internetadresse.' };
    data.link_url = link.value;
  }
  if (!partial || has('linkLabel')) data.link_label = cleanText(body.linkLabel, 80);
  return { ok: true, data };
}

// ------------------------------------------------------------------ SQL --

const mapFile = (row) => ({
  id: row.id,
  mimeType: row.mime_type,
  kind: kindOf(row.mime_type),
  originalName: row.original_name,
  sizeBytes: row.size_bytes,
  url: `/api/library/entries/${row.entry_id}/files/${row.id}`,
});

function mapEntry(row, fileRows = []) {
  return {
    id: row.id,
    scope: row.scope,
    teamId: row.team_id,
    category: row.category,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    linkLabel: row.link_label,
    isPinned: Boolean(row.is_pinned),
    author: [row.author_first_name, row.author_last_name].filter(Boolean).join(' ') || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    files: fileRows.map(mapFile),
  };
}

const SELECT_ENTRY = `
  SELECT e.*, u.first_name AS author_first_name, u.last_name AS author_last_name
    FROM library_entries e
    LEFT JOIN users u ON u.id = COALESCE(e.updated_by, e.created_by)`;

async function withFiles(rows) {
  if (rows.length === 0) return [];
  const [fileRows] = await pool.query(
    'SELECT * FROM library_files WHERE entry_id IN (?) ORDER BY sort_order, id',
    [rows.map((row) => row.id)]
  );
  return rows.map((row) => mapEntry(row, fileRows.filter((file) => file.entry_id === row.id)));
}

async function findEntry(id) {
  const [rows] = await pool.query(`${SELECT_ENTRY} WHERE e.id = ?`, [id]);
  return (await withFiles(rows))[0] ?? null;
}

async function addFiles(entryId, records, startOrder = 0) {
  if (records.length === 0) return;
  await pool.query(
    'INSERT INTO library_files (entry_id, file_path, mime_type, original_name, size_bytes, sort_order) VALUES ?',
    [records.map((file, i) => [entryId, file.path, file.mimeType, file.originalName, file.sizeBytes, startOrder + i])]
  );
}

// --------------------------------------------------------------- Zugriff --

/** Bereich aus dem Query-String prüfen – VOR dem Datei-Empfang. */
function requireScope({ manage = false } = {}) {
  return async (req, res, next) => {
    try {
      const scope = String(req.query.scope ?? '');
      const teamId = null;
      const rights = await access.resolve(req, scope, teamId);
      if (!rights.ok) return res.status(rights.status).json({ message: rights.message });
      if (manage && !rights.canManage) {
        return res.status(403).json({ message: 'Du darfst diesen Bereich nur lesen.' });
      }
      req.library = { scope, teamId, canManage: rights.canManage };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Eintrag laden und Rechte prüfen. Fremde Einträge werden nicht verraten. */
function requireEntry({ manage = false } = {}) {
  return async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const entry = id ? await findEntry(id) : null;
      if (!entry) return res.status(404).json(NOT_FOUND);
      const rights = await access.resolve(req, entry.scope, entry.teamId);
      if (!rights.ok) return res.status(404).json(NOT_FOUND);
      if (manage && !rights.canManage) {
        return res.status(403).json({ message: 'Du darfst diesen Bereich nur lesen.' });
      }
      req.entry = entry;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// ---------------------------------------------------------------- Routen --

router.get('/overview', async (req, res, next) => {
  try {
    return res.json(await access.overview(req));
  } catch (err) {
    return next(err);
  }
});

router.get('/entries', requireScope(), async (req, res, next) => {
  try {
    const { scope, teamId, canManage } = req.library;
    const [rows] = await pool.query(
      `${SELECT_ENTRY}
        WHERE e.scope = ? AND (? IS NULL OR e.team_id = ?)
        ORDER BY e.is_pinned DESC, e.category IS NULL, e.category, e.updated_at DESC, e.id DESC`,
      [scope, teamId, teamId]
    );
    return res.json({ entries: await withFiles(rows), canManage });
  } catch (err) {
    return next(err);
  }
});

router.post('/entries', forbidWhileActingAs, uploadLimiter, requireScope({ manage: true }), files.receive, async (req, res, next) => {
  const uploaded = Array.isArray(req.files) ? req.files : [];
  try {
    const checked = validate(req.body ?? {});
    const verified = checked.ok ? await files.verify(uploaded) : checked;
    if (!verified.ok) {
      await files.discard(uploaded);
      return res.status(400).json({ message: verified.message });
    }
    const { scope, teamId } = req.library;
    const d = checked.data;
    const [result] = await pool.query(
      `INSERT INTO library_entries
         (scope, team_id, category, title, body, link_url, link_label, is_pinned, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope, teamId, d.category, d.title, d.body, d.link_url, d.link_label, d.is_pinned, req.userId]
    );
    await addFiles(result.insertId, files.records(uploaded));
    return res.status(201).json({ entry: await findEntry(result.insertId) });
  } catch (err) {
    await files.discard(uploaded);
    return next(err);
  }
});

router.patch('/entries/:id', forbidWhileActingAs, requireEntry({ manage: true }), async (req, res, next) => {
  try {
    const checked = validate(req.body ?? {}, true);
    if (!checked.ok) return res.status(400).json({ message: checked.message });
    const fields = { ...checked.data, updated_by: req.userId };
    const keys = Object.keys(fields);
    await pool.query(
      `UPDATE library_entries SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((key) => fields[key]), req.entry.id]
    );
    return res.json({ entry: await findEntry(req.entry.id) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/entries/:id', forbidWhileActingAs, requireEntry({ manage: true }), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT file_path FROM library_files WHERE entry_id = ?', [req.entry.id]);
    await pool.query('DELETE FROM library_entries WHERE id = ?', [req.entry.id]);
    for (const row of rows) await files.removeUpload(row.file_path);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

router.post('/entries/:id/files', forbidWhileActingAs, uploadLimiter, requireEntry({ manage: true }), files.receive, async (req, res, next) => {
  const uploaded = Array.isArray(req.files) ? req.files : [];
  try {
    if (uploaded.length === 0) return res.status(400).json({ message: 'Keine Datei angehängt.' });
    const verified =
      req.entry.files.length + uploaded.length > MAX_FILES_PER_ENTRY
        ? { ok: false, message: `Höchstens ${MAX_FILES_PER_ENTRY} Dateien je Eintrag.` }
        : await files.verify(uploaded);
    if (!verified.ok) {
      await files.discard(uploaded);
      return res.status(400).json({ message: verified.message });
    }
    await addFiles(req.entry.id, files.records(uploaded), req.entry.files.length);
    await pool.query('UPDATE library_entries SET updated_by = ?, updated_at = NOW() WHERE id = ?', [req.userId, req.entry.id]);
    return res.status(201).json({ entry: await findEntry(req.entry.id) });
  } catch (err) {
    await files.discard(uploaded);
    return next(err);
  }
});

router.delete('/entries/:id/files/:fileId', forbidWhileActingAs, requireEntry({ manage: true }), async (req, res, next) => {
  try {
    const fileId = parseId(req.params.fileId);
    const [[row]] = await pool.query('SELECT file_path FROM library_files WHERE id = ? AND entry_id = ?', [fileId, req.entry.id]);
    if (!row) return res.status(404).json({ message: 'Datei nicht gefunden.' });
    await pool.query('DELETE FROM library_files WHERE id = ?', [fileId]);
    await files.removeUpload(row.file_path);
    return res.json({ entry: await findEntry(req.entry.id) });
  } catch (err) {
    return next(err);
  }
});

router.get('/entries/:id/files/:fileId', requireEntry(), async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM library_files WHERE id = ? AND entry_id = ?', [parseId(req.params.fileId), req.entry.id]);
    return files.send(req, res, row);
  } catch (err) {
    return next(err);
  }
});

module.exports = { router, files };
