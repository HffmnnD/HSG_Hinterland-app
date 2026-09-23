// Datenzugriff für Vereins-News (`news` + `news_images`). Enthält
// AUSSCHLIESSLICH SQL – keine Validierung, keine HTTP-Logik. Rückgaben sind
// bereits camelCase für das Frontend aufbereitet; Bilder werden als fertige
// URLs geliefert.
//
// Beiträge werden ARCHIVIERT statt gelöscht (`is_archived`, Migration 006):
// der Feed liest nur aktive Beiträge, die Verwaltung sieht beide Stapel und
// kann jederzeit zurückholen. Endgültiges Löschen bleibt als getrennte,
// bewusste Aktion bestehen (`remove`) – nur so werden auch die Bilder frei.
//
// Bilder hängen seit Migration 008 in `news_images` (1:n, beliebig viele je
// Beitrag). Geladen werden sie mit EINER Sammelabfrage für alle Beiträge einer
// Liste, nicht je Beitrag einzeln – sonst wäre der Feed ein N+1-Problem.
const pool = require('../config/db');
const { publicUrlFor } = require('../config/uploads');

function mapNews(row, imagePaths = []) {
  const imageUrls = imagePaths.map(publicUrlFor).filter(Boolean);

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    // `imageUrls` ist die maßgebliche Form. `imageUrl` bleibt als erstes Bild
    // erhalten, damit Ansichten mit nur einem Vorschaubild unverändert laufen.
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Verfasser:in – null, wenn das Konto zwischenzeitlich gelöscht wurde.
    author:
      row.author_id === null
        ? null
        : {
            id: row.author_id,
            firstName: row.author_first_name,
            lastName: row.author_last_name,
          },
  };
}

const SELECT_NEWS = `
  SELECT n.id, n.title, n.content, n.is_archived,
         n.created_at, n.updated_at,
         n.author_id, u.first_name AS author_first_name, u.last_name AS author_last_name
    FROM news n
    LEFT JOIN users u ON u.id = n.author_id`;

/**
 * Bildpfade zu mehreren Beiträgen – EINE Abfrage, nach Beitrag gruppiert.
 * @param {number[]} newsIds
 * @returns {Promise<Map<number, string[]>>} je Beitrag die Pfade in Reihenfolge
 */
async function imagePathsByNews(newsIds, runner = pool) {
  if (newsIds.length === 0) return new Map();

  const [rows] = await runner.query(
    `SELECT news_id, image_path
       FROM news_images
      WHERE news_id IN (?)
      ORDER BY news_id, sort_order, id`,
    [newsIds]
  );

  const byNews = new Map();
  for (const row of rows) {
    if (!byNews.has(row.news_id)) byNews.set(row.news_id, []);
    byNews.get(row.news_id).push(row.image_path);
  }
  return byNews;
}

/**
 * Beiträge, neueste zuerst.
 *
 * @param {object} [opts]
 * @param {number}  [opts.limit]    Obergrenze (z. B. Dashboard-Feed).
 * @param {'active'|'archived'|'all'} [opts.status='active']
 *   `active` = Feed-Ansicht (Standard), `archived` = Archiv der Verwaltung,
 *   `all` = beides.
 */
async function listAll({ limit, status = 'active' } = {}, runner = pool) {
  const where = [];
  const params = [];

  if (status === 'active') where.push('n.is_archived = 0');
  else if (status === 'archived') where.push('n.is_archived = 1');

  // ORDER BY id als zweites Kriterium: mehrere Beiträge in derselben Sekunde
  // bekommen sonst keine stabile Reihenfolge.
  let sql = `${SELECT_NEWS}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY n.created_at DESC, n.id DESC`;

  if (limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  const [rows] = await runner.query(sql, params);
  const byNews = await imagePathsByNews(
    rows.map((row) => row.id),
    runner
  );
  return rows.map((row) => mapNews(row, byNews.get(row.id) ?? []));
}

/**
 * Anzahl aktiver und archivierter Beiträge – für die Reiter der Verwaltung,
 * damit dort auch dann eine Zahl steht, wenn gerade der andere Stapel
 * angezeigt wird.
 * @returns {Promise<{ active:number, archived:number }>}
 */
async function countByStatus(runner = pool) {
  const [[row]] = await runner.query(
    `SELECT SUM(is_archived = 0) AS active, SUM(is_archived = 1) AS archived
       FROM news`
  );
  return {
    active: Number(row?.active ?? 0),
    archived: Number(row?.archived ?? 0),
  };
}

/** Ein Beitrag anhand seiner ID. null wenn unbekannt. */
async function findById(id, runner = pool) {
  const [rows] = await runner.query(`${SELECT_NEWS} WHERE n.id = ?`, [id]);
  if (!rows[0]) return null;

  const byNews = await imagePathsByNews([id], runner);
  return mapNews(rows[0], byNews.get(id) ?? []);
}

/**
 * Rohe Bildpfade eines Beitrags (zum Aufräumen der Dateien beim Löschen).
 *
 * Die Existenzprüfung ist getrennt, weil ein Beitrag OHNE Bilder eine leere
 * Liste liefern muss – ein unbekannter Beitrag dagegen `undefined`, damit der
 * Controller ein 404 daraus machen kann.
 *
 * @returns {Promise<string[]|undefined>} undefined = Beitrag existiert nicht.
 */
async function findImagePaths(id, runner = pool) {
  const [[exists]] = await runner.query('SELECT id FROM news WHERE id = ?', [id]);
  if (!exists) return undefined;

  const [rows] = await runner.query(
    'SELECT image_path FROM news_images WHERE news_id = ? ORDER BY sort_order, id',
    [id]
  );
  return rows.map((row) => row.image_path);
}

/**
 * Legt einen Beitrag samt Bildern an – in EINER Transaktion. Scheitert das
 * Einfügen der Bilder, entsteht auch kein Beitrag; ein Beitrag mit halber
 * Bilderstrecke wäre schlimmer als gar keiner.
 *
 * @param {{ title:string, content:string, imagePaths:string[], authorId:number }} data
 *   `imagePaths` in Anzeigereihenfolge (beliebig viele).
 * @returns {Promise<number>} ID des neuen Beitrags
 */
async function create({ title, content, imagePaths = [], authorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO news (title, content, author_id) VALUES (?, ?, ?)',
      [title, content, authorId]
    );
    const newsId = result.insertId;

    if (imagePaths.length > 0) {
      await conn.query(
        'INSERT INTO news_images (news_id, image_path, sort_order) VALUES ?',
        [imagePaths.map((path, index) => [newsId, path, index])]
      );
    }

    await conn.commit();
    return newsId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Archiviert einen Beitrag oder holt ihn zurück.
 *
 * `is_archived <> ?` im WHERE: eine Änderung, die nichts ändert (zweimal
 * archivieren), liefert 0 – der Controller macht daraus eine ehrliche
 * Rückmeldung statt eines stillen "gespeichert".
 *
 * @returns {Promise<number>} Anzahl geänderter Zeilen
 */
async function setArchived(id, isArchived, runner = pool) {
  const flag = isArchived ? 1 : 0;
  const [result] = await runner.query(
    'UPDATE news SET is_archived = ? WHERE id = ? AND is_archived <> ?',
    [flag, id, flag]
  );
  return result.affectedRows;
}

/**
 * Löscht einen Beitrag endgültig. Die Zeilen in `news_images` verschwinden per
 * ON DELETE CASCADE mit; die DATEIEN räumt der Controller weg (er liest die
 * Pfade vorher über findImagePaths aus).
 * @returns {Promise<number>} Anzahl gelöschter Zeilen (0 = nicht vorhanden)
 */
async function remove(id, runner = pool) {
  const [result] = await runner.query('DELETE FROM news WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = {
  listAll,
  countByStatus,
  findById,
  findImagePaths,
  create,
  setArchived,
  remove,
};
