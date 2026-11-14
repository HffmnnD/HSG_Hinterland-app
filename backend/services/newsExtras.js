// News-Erweiterungen aus Migration 033: Zielgruppen (Mannschaften), Verweis
// (z. B. Livestream) sowie Dokumente und Videos als Anhang.
//
// Bewusst neben newsRepository statt darin: Text und Bilder eines Beitrags
// bleiben, wie sie sind – diese Datei ergänzt sie um das, was das Lastenheft
// (2.2) zusätzlich verlangt. Fehlt Migration 033, liefert sie nichts dazu.
const pool = require('../config/db');
const { createAttachmentStore, kindOf } = require('../files/attachments');

const files = createAttachmentStore({ subdir: 'news-files' });
const LINK_KINDS = ['link', 'livestream', 'video'];
const MAX_FILES_PER_NEWS = 20;

const missing = (err) => err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR';

/** Prüft Zielgruppe und Verweis aus dem Formular. */
async function validate(body) {
  const audience = body?.audience === 'teams' ? 'teams' : 'club';
  let teamIds = [];
  if (audience === 'teams') {
    // multipart liefert „1,2,3", JSON eine Liste.
    const raw = Array.isArray(body.teamIds) ? body.teamIds : String(body.teamIds ?? '').split(',');
    teamIds = [...new Set(raw.map(Number))].filter((id) => Number.isInteger(id) && id > 0);
    if (teamIds.length === 0) return { ok: false, message: 'Bitte mindestens eine Mannschaft auswählen.' };
    const [rows] = await pool.query('SELECT id FROM teams WHERE id IN (?)', [teamIds]);
    if (rows.length !== teamIds.length) return { ok: false, message: 'Unbekannte Mannschaft in der Auswahl.' };
  }

  let linkUrl = null;
  const rawLink = typeof body?.linkUrl === 'string' ? body.linkUrl.trim() : '';
  if (rawLink) {
    try {
      const url = new URL(/^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      linkUrl = url.toString().slice(0, 500);
    } catch {
      return { ok: false, message: 'Der Link ist keine gültige Internetadresse.' };
    }
  }
  const linkKind = LINK_KINDS.includes(body?.linkKind) ? body.linkKind : 'link';
  return { ok: true, audience, teamIds, linkUrl, linkKind };
}

/** Zielgruppe und Verweis eines frisch angelegten Beitrags speichern. */
async function save(newsId, { audience, teamIds, linkUrl, linkKind }) {
  await pool.query('UPDATE news SET audience = ?, link_url = ?, link_kind = ? WHERE id = ?', [audience, linkUrl, linkKind, newsId]);
  // Beim Bearbeiten ersetzt die neue Auswahl die alte.
  await pool.query('DELETE FROM news_teams WHERE news_id = ?', [newsId]);
  if (teamIds.length > 0) {
    await pool.query('INSERT IGNORE INTO news_teams (news_id, team_id) VALUES ?', [teamIds.map((id) => [newsId, id])]);
  }
}

const mapFile = (row) => ({
  id: row.id,
  mimeType: row.mime_type,
  kind: kindOf(row.mime_type),
  originalName: row.original_name,
  sizeBytes: row.size_bytes,
  url: `/api/news/${row.news_id}/files/${row.id}`,
});

/**
 * Ergänzt Beiträge um audience, teams, link und files – und lässt weg, was
 * die Person nicht sehen darf.
 * @param {object[]} news  Beiträge aus newsRepository
 * @param {{ userId:number, seesAll:boolean }} viewer
 */
async function decorate(news, viewer) {
  if (news.length === 0) return news;
  const ids = news.map((item) => item.id);
  try {
    const [meta] = await pool.query('SELECT id, audience, link_url, link_kind FROM news WHERE id IN (?)', [ids]);
    const [teams] = await pool.query(
      `SELECT nt.news_id, t.id, t.code, t.name FROM news_teams nt
         JOIN teams t ON t.id = nt.team_id WHERE nt.news_id IN (?) ORDER BY t.name`,
      [ids]
    );
    const [fileRows] = await pool.query('SELECT * FROM news_files WHERE news_id IN (?) ORDER BY sort_order, id', [ids]);
    let ownTeams = new Set();
    if (!viewer.seesAll) {
      const [rows] = await pool.query('SELECT team_id FROM user_teams WHERE user_id = ? AND is_confirmed = 1', [viewer.userId]);
      ownTeams = new Set(rows.map((row) => row.team_id));
    }

    return news
      .map((item) => {
        const info = meta.find((row) => row.id === item.id);
        const itemTeams = teams.filter((row) => row.news_id === item.id);
        return {
          ...item,
          audience: info?.audience ?? 'club',
          teams: itemTeams.map((row) => ({ id: row.id, code: row.code, name: row.name })),
          link: info?.link_url ? { url: info.link_url, kind: info.link_kind } : null,
          files: fileRows.filter((row) => row.news_id === item.id).map(mapFile),
        };
      })
      .filter(
        (item) => viewer.seesAll || item.audience === 'club' || item.teams.some((team) => ownTeams.has(team.id))
      );
  } catch (err) {
    if (missing(err)) return news.map((item) => ({ ...item, audience: 'club', teams: [], link: null, files: [] }));
    throw err;
  }
}

async function countFiles(newsId) {
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM news_files WHERE news_id = ?', [newsId]);
  return Number(row.total);
}

async function addFiles(newsId, records) {
  const start = await countFiles(newsId);
  await pool.query(
    'INSERT INTO news_files (news_id, file_path, mime_type, original_name, size_bytes, sort_order) VALUES ?',
    [records.map((file, i) => [newsId, file.path, file.mimeType, file.originalName, file.sizeBytes, start + i])]
  );
}

async function findFile(newsId, fileId) {
  const [[row]] = await pool.query('SELECT * FROM news_files WHERE id = ? AND news_id = ?', [fileId, newsId]);
  return row ?? null;
}

/** Pfade aller Anhänge – VOR dem Löschen eines Beitrags auslesen. */
async function filePaths(newsId) {
  try {
    const [rows] = await pool.query('SELECT file_path FROM news_files WHERE news_id = ?', [newsId]);
    return rows.map((row) => row.file_path);
  } catch (err) {
    if (missing(err)) return [];
    throw err;
  }
}

/** Konten, die einen Beitrag für Mannschaften sehen dürfen (für Push). */
async function audienceUserIds(teamIds) {
  if (teamIds.length === 0) return [];
  const [rows] = await pool.query('SELECT DISTINCT user_id FROM user_teams WHERE team_id IN (?) AND is_confirmed = 1', [teamIds]);
  return rows.map((row) => row.user_id);
}

module.exports = { files, MAX_FILES_PER_NEWS, validate, save, decorate, countFiles, addFiles, findFile, filePaths, audienceUserIds };
