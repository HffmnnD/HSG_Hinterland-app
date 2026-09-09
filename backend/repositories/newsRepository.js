// Datenzugriff für Vereins-News (`news`). Enthält AUSSCHLIESSLICH SQL – keine
// Validierung, keine HTTP-Logik. Rückgaben sind bereits camelCase für das
// Frontend aufbereitet; das Bild wird als fertige URL geliefert.
const pool = require('../config/db');
const { publicUrlFor } = require('../config/uploads');

function mapNews(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    imageUrl: publicUrlFor(row.image_path),
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
  SELECT n.id, n.title, n.content, n.image_path, n.created_at, n.updated_at,
         n.author_id, u.first_name AS author_first_name, u.last_name AS author_last_name
    FROM news n
    LEFT JOIN users u ON u.id = n.author_id`;

/**
 * Alle Beiträge, neueste zuerst.
 * @param {{ limit?: number }} [opts] Optionale Obergrenze (z. B. Dashboard-Feed).
 */
async function listAll({ limit } = {}, runner = pool) {
  // ORDER BY id als zweites Kriterium: mehrere Beiträge in derselben Sekunde
  // bekommen sonst keine stabile Reihenfolge.
  let sql = `${SELECT_NEWS} ORDER BY n.created_at DESC, n.id DESC`;
  const params = [];

  if (limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  const [rows] = await runner.query(sql, params);
  return rows.map(mapNews);
}

/** Ein Beitrag anhand seiner ID. null wenn unbekannt. */
async function findById(id, runner = pool) {
  const [rows] = await runner.query(`${SELECT_NEWS} WHERE n.id = ?`, [id]);
  return rows[0] ? mapNews(rows[0]) : null;
}

/**
 * Roher Bildpfad eines Beitrags (zum Aufräumen der Datei beim Löschen).
 * @returns {Promise<string|null|undefined>} undefined = Beitrag existiert nicht.
 */
async function findImagePath(id, runner = pool) {
  const [rows] = await runner.query('SELECT image_path FROM news WHERE id = ?', [id]);
  return rows[0] ? rows[0].image_path : undefined;
}

/**
 * Legt einen Beitrag an.
 * @param {{ title:string, content:string, imagePath:string|null, authorId:number }} data
 * @returns {Promise<number>} ID des neuen Beitrags
 */
async function create({ title, content, imagePath, authorId }, runner = pool) {
  const [result] = await runner.query(
    'INSERT INTO news (title, content, image_path, author_id) VALUES (?, ?, ?, ?)',
    [title, content, imagePath, authorId]
  );
  return result.insertId;
}

/**
 * Löscht einen Beitrag.
 * @returns {Promise<number>} Anzahl gelöschter Zeilen (0 = nicht vorhanden)
 */
async function remove(id, runner = pool) {
  const [result] = await runner.query('DELETE FROM news WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = { listAll, findById, findImagePath, create, remove };
