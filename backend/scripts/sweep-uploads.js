// Wartungsskript: findet verwaiste Bilder (News-Beiträge und Mannschaftsfotos).
//
//   npm run uploads:sweep            nur anzeigen (Standard)
//   npm run uploads:sweep -- --apply wirklich löschen
//
// Alle regulären Code-Pfade räumen selbst auf: schlägt die Validierung oder
// die Signaturprüfung fehl, löscht der Controller die Datei sofort; beim
// Löschen eines Beitrags verschwindet sie mit. Eine Datei kann trotzdem
// zurückbleiben, wenn eine Anfrage mittendrin abbricht (Netzwerk weg, Tab
// geschlossen, Server-Neustart) – nachdem multer geschrieben hat, aber bevor
// der Controller fertig war. Dieses Skript räumt solche Reste weg.
//
// WICHTIG bei neuen Bildarten: Jede Tabelle, die einen Upload-Pfad speichert,
// MUSS unten in REFERENCE_QUERIES stehen. Fehlt sie, hält das Skript ihre
// Dateien für verwaist und löscht sie mit --apply.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const { UPLOAD_ROOT } = require('../config/uploads');

const APPLY = process.argv.includes('--apply');

// Alle Stellen, an denen ein Upload-Pfad in der Datenbank steht.
const REFERENCE_QUERIES = [
  {
    label: 'News-Bilder',
    // UNION ALL über beide Bildspalten: ein Beitrag darf zwei Bilder haben
    // (Migration 007). Fehlte die zweite Spalte hier, hielte der Lauf jedes
    // zweite Bild für verwaist und würde es löschen.
    sql: `SELECT image_path   AS path FROM news WHERE image_path   IS NOT NULL
          UNION ALL
          SELECT image_path_2 AS path FROM news WHERE image_path_2 IS NOT NULL`,
  },
  { label: 'Mannschaftsfotos', sql: 'SELECT photo_path AS path FROM teams WHERE photo_path IS NOT NULL' },
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hsg_hinterland',
  });

  const referenced = new Set();
  try {
    for (const query of REFERENCE_QUERIES) {
      const [rows] = await connection.query(query.sql);
      rows.forEach((row) => referenced.add(row.path));
      console.log(`${query.label.padEnd(24)} : ${rows.length}`);
    }
  } finally {
    await connection.end();
  }

  // Alle Dateien unterhalb von uploads/ einsammeln (relativ zur Wurzel).
  const files = [];
  const walk = (dir, prefix = '') => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else files.push(rel);
    }
  };
  walk(UPLOAD_ROOT);

  const orphans = files.filter((file) => !referenced.has(file));
  const missing = [...referenced].filter((ref) => !files.includes(ref));

  console.log(`Dateien im Upload-Ordner : ${files.length}`);
  console.log(`In der Datenbank benutzt : ${referenced.size}`);
  console.log(`Verwaist                 : ${orphans.length}`);

  for (const orphan of orphans) {
    if (APPLY) {
      fs.unlinkSync(path.join(UPLOAD_ROOT, orphan));
      console.log(`  gelöscht: ${orphan}`);
    } else {
      console.log(`  würde löschen: ${orphan}`);
    }
  }

  if (missing.length > 0) {
    console.log(
      `\nAchtung: ${missing.length} Beitrag/Beiträge verweisen auf fehlende Dateien:`
    );
    missing.forEach((ref) => console.log(`  ${ref}`));
  }

  if (orphans.length > 0 && !APPLY) {
    console.log('\nZum tatsächlichen Löschen: npm run uploads:sweep -- --apply');
  }
}

main().catch((err) => {
  console.error('Aufräumen fehlgeschlagen:', err.message);
  process.exit(1);
});
