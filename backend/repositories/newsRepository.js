// Datenzugriff für Vereins-News (`news`). Enthält AUSSCHLIESSLICH SQL – keine
// Validierung, keine HTTP-Logik. Rückgaben sind bereits camelCase für das
// Frontend aufbereitet; das Bild wird als fertige URL geliefert.
//
// Beiträge werden ARCHIVIERT statt gelöscht (`is_archived`, Migration 006):
// der Feed liest nur aktive Beiträge, die Verwaltung sieht beide Stapel und
// kann jederzeit zurückholen. Endgültiges Löschen bleibt als getrennte,
// bewusste Aktion bestehen (`remove`) – nur so wird auch das Bild frei.
const pool = require('../config/db');
const { publicUrlFor } = require('../config/uploads');

function mapNews(row) {
  // Bis zu zwei Bilder, Lücken herausgefiltert. `imageUrls` ist die
  // maßgebliche Form; `imageUrl` bleibt als erstes Bild erhalten, damit
  // bestehende Ansichten (Dashboard-Karte, Vorschaubild der Verwaltung)
  // unverändert weiterlaufen.
  const imageUrls = [row.image_path, row.image_path_2]
    .map(publicUrlFor)
    .filter(Boolean);

  return {
    id: row.id,
    title: row.title,
    content: row.content,
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
  SELECT n.id, n.title, n.content, n.image_path, n.image_path_2, n.is_archived,
         n.created_at, n.updated_at,
         n.author_id, u.first_name AS author_first_name, u.last_name AS author_last_name
    FROM news n
    LEFT JOIN users u ON u.id = n.author_id`;

/**
 * Beiträge, neueste zuerst.
 *
 * @param {object} [opts]
 * @param {number}  [opts.limit]    Obergrenze (z. B. Dashboard-Feed).
 * @param {'active'|'archived'|'all'} [opts.status='active']
 *   `active` = Feed-Ansicht (Standard), `archived` = Papierkorb der
 *   Verwaltung, `all` = beides.
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
  return rows.map(mapNews);
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
  return rows[0] ? mapNews(rows[0]) : null;
}

/**
 * Rohe Bildpfade eines Beitrags (zum Aufräumen der Dateien beim Löschen).
 * @returns {Promise<string[]|undefined>} undefined = Beitrag existiert nicht,
 *   sonst 0–2 Pfade ohne Lücken.
 */
async function findImagePaths(id, runner = pool) {
  const [rows] = await runner.query(
    'SELECT image_path, image_path_2 FROM news WHERE id = ?',
    [id]
  );
  if (!rows[0]) return undefined;
  return [rows[0].image_path, rows[0].image_path_2].filter(Boolean);
}

/**
 * Legt einen Beitrag an.
 * @param {{ title:string, content:string, imagePaths:string[], authorId:number }} data
 *   `imagePaths` enthält 0–2 Pfade in Anzeigereihenfolge.
 * @returns {Promise<number>} ID des neuen Beitrags
 */
async function create({ title, content, imagePaths = [], authorId }, runner = pool) {
  const [result] = await runner.query(
    `INSERT INTO news (title, content, image_path, image_path_2, author_id)
     VALUES (?, ?, ?, ?, ?)`,
    [title, content, imagePaths[0] ?? null, imagePaths[1] ?? null, authorId]
  );
  return result.insertId;
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
 * Löscht einen Beitrag endgültig.
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
