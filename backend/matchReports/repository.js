// SQL der Spielberichte (Migration 022: match_reports, match_report_files).
const pool = require('../config/db');
const { ALLOWED } = require('./upload');

/** Saison eines Spieltags: Juli–Juni, z. B. 2026-11-07 -> "2026/27". */
function seasonOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const start = d.getMonth() >= 6 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

/** DATE aus MySQL als "YYYY-MM-DD" (ohne Zeitzonen-Verschiebung). */
function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapFile(row, reportId) {
  return {
    id: row.id,
    mimeType: row.mime_type,
    kind: ALLOWED.get(row.mime_type)?.kind ?? 'file',
    originalName: row.original_name,
    sizeBytes: row.size_bytes,
    url: `/api/match-reports/${reportId}/files/${row.id}`,
  };
}

function mapReport(row, files = []) {
  const gameDate = toIsoDate(row.game_date);
  return {
    id: row.id,
    teamId: row.team_id,
    meetingId: row.meeting_id,
    gameId: row.game_id,
    gameDate,
    season: seasonOf(gameDate),
    opponent: row.opponent,
    isHome: row.is_home === null ? null : Boolean(row.is_home),
    title: row.title,
    summary: row.summary,
    body: row.body ?? null,
    team: row.team_name ? { id: row.team_id, code: row.team_code, name: row.team_name } : null,
    uploadedBy: row.uploaded_by
      ? {
          id: row.uploaded_by,
          name: [row.uploader_first_name, row.uploader_last_name].filter(Boolean).join(' ') || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    files: files.map((f) => mapFile(f, row.id)),
  };
}

const SELECT_REPORT = `
  SELECT r.*, u.first_name AS uploader_first_name, u.last_name AS uploader_last_name,
         t.name AS team_name, t.code AS team_code
    FROM match_reports r
    LEFT JOIN users u ON u.id = r.uploaded_by
    LEFT JOIN teams t ON t.id = r.team_id`;

async function filesFor(reportIds) {
  if (reportIds.length === 0) return new Map();
  const [rows] = await pool.query(
    `SELECT * FROM match_report_files WHERE report_id IN (?) ORDER BY sort_order, id`,
    [reportIds]
  );
  const byReport = new Map();
  for (const row of rows) {
    if (!byReport.has(row.report_id)) byReport.set(row.report_id, []);
    byReport.get(row.report_id).push(row);
  }
  return byReport;
}

async function withFiles(rows) {
  const files = await filesFor(rows.map((r) => r.id));
  return rows.map((row) => mapReport(row, files.get(row.id) ?? []));
}

/** Alle Berichte einer Mannschaft, neuester Spieltag zuerst. */
async function listForTeam(teamId) {
  const [rows] = await pool.query(
    `${SELECT_REPORT} WHERE r.team_id = ? ORDER BY r.game_date DESC, r.id DESC`,
    [teamId]
  );
  return withFiles(rows);
}

/** Neueste Berichte aller Mannschaften (Reiter „Infos" unter Verein). */
async function listRecent({ limit = 20, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `${SELECT_REPORT} ORDER BY r.game_date DESC, r.id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return withFiles(rows);
}

/** Berichte zu einem Spiel (nuLiga-/nuScoreLive-Spielnummer). */
async function listForMeeting(meetingId) {
  const [rows] = await pool.query(
    `${SELECT_REPORT} WHERE r.meeting_id = ? ORDER BY r.created_at DESC`,
    [String(meetingId)]
  );
  return withFiles(rows);
}

async function findById(id) {
  const [rows] = await pool.query(`${SELECT_REPORT} WHERE r.id = ?`, [id]);
  if (rows.length === 0) return null;
  return (await withFiles(rows))[0];
}

async function findFile(reportId, fileId) {
  const [rows] = await pool.query(
    'SELECT * FROM match_report_files WHERE id = ? AND report_id = ?',
    [fileId, reportId]
  );
  return rows[0] ?? null;
}

async function countFiles(reportId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) AS maxOrder FROM match_report_files WHERE report_id = ?',
    [reportId]
  );
  return { count: Number(rows[0].n), maxOrder: Number(rows[0].maxOrder) };
}

/**
 * Bericht samt Dateien anlegen (eine Transaktion).
 * @param {object} data validierte Felder
 * @param {{ path, mimeType, originalName, sizeBytes }[]} files
 */
async function create(data, files) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO match_reports
         (team_id, meeting_id, game_id, game_date, opponent, is_home, title, summary, body, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.teamId,
        data.meetingId,
        data.gameId,
        data.gameDate,
        data.opponent,
        data.isHome === null ? null : data.isHome ? 1 : 0,
        data.title,
        data.summary,
        data.body ?? null,
        data.uploadedBy,
      ]
    );
    await insertFiles(conn, result.insertId, files, 0);
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function insertFiles(runner, reportId, files, startOrder) {
  let order = startOrder;
  for (const file of files) {
    await runner.query(
      `INSERT INTO match_report_files (report_id, file_path, mime_type, original_name, size_bytes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reportId, file.path, file.mimeType, file.originalName, file.sizeBytes, order]
    );
    order += 1;
  }
}

async function addFiles(reportId, files) {
  const { maxOrder } = await countFiles(reportId);
  await insertFiles(pool, reportId, files, maxOrder + 1);
}

/** Nur die übergebenen Felder ändern. */
async function update(id, data) {
  const columns = {
    gameDate: 'game_date',
    opponent: 'opponent',
    isHome: 'is_home',
    title: 'title',
    summary: 'summary',
    body: 'body',
    teamId: 'team_id',
    meetingId: 'meeting_id',
    gameId: 'game_id',
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in data)) continue;
    sets.push(`${column} = ?`);
    const value = data[key];
    values.push(key === 'isHome' ? (value === null ? null : value ? 1 : 0) : value);
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE match_reports SET ${sets.join(', ')} WHERE id = ?`, values);
}

/** Löscht den Bericht und gibt die Pfade seiner Dateien zurück. */
async function remove(id) {
  const [files] = await pool.query('SELECT file_path FROM match_report_files WHERE report_id = ?', [id]);
  await pool.query('DELETE FROM match_reports WHERE id = ?', [id]);
  return files.map((f) => f.file_path);
}

async function removeFile(reportId, fileId) {
  const file = await findFile(reportId, fileId);
  if (!file) return null;
  await pool.query('DELETE FROM match_report_files WHERE id = ?', [fileId]);
  return file.file_path;
}

module.exports = {
  seasonOf,
  listForTeam,
  listRecent,
  listForMeeting,
  findById,
  findFile,
  countFiles,
  create,
  addFiles,
  update,
  remove,
  removeFile,
};
