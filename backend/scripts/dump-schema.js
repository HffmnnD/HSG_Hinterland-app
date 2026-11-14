// Schreibt db/schema.sql neu – aus der Datenbank, auf die .env zeigt.
//
//   npm run migrate        (Datenbank auf den neuesten Stand bringen)
//   npm run schema:dump    (schema.sql daraus erzeugen)
//
// schema.sql ist der Gesamtstand ALLER Migrationen für eine frische
// Installation. Von Hand gepflegt lief die Datei den Migrationen hinterher;
// deshalb entsteht sie jetzt aus der Datenbank selbst. Die Erklärungen stehen
// als COMMENT an Tabellen und Spalten und bleiben so erhalten.
//
// Enthalten sind die Struktur aller Tabellen, die Stammdaten der Rollen
// (roles, role_permissions) und der Migrationsverlauf – damit `npm run
// migrate` nach dem Einspielen nichts doppelt ausführt. Mitglieder, Termine
// und alle anderen Inhalte sind NICHT enthalten (dafür gibt es backup/).
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const TARGET = path.join(__dirname, '..', 'db', 'schema.sql');
// Tabellen, deren Zeilen zum Schema gehören.
const SEED_TABLES = ['roles', 'role_permissions'];

async function main() {
  const database = process.env.DB_NAME || 'hsg_hinterland';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    dateStrings: true,
  });

  try {
    const [migrations] = await conn.query('SELECT filename FROM schema_migrations ORDER BY filename');
    const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const names = tables.map((row) => Object.values(row)[0]).sort();

    const out = [
      '-- ============================================================================',
      '--  HSG Hinterland – Gesamtschema (Stand aller Migrationen)',
      '-- ----------------------------------------------------------------------------',
      '--  ERZEUGT mit `npm run schema:dump` – bitte nicht von Hand ändern.',
      '--  Änderungen am Schema kommen als neue Datei nach db/migrations/, danach',
      '--  `npm run migrate` und `npm run schema:dump`.',
      `--  Letzte enthaltene Migration: ${migrations.at(-1)?.filename ?? '–'}`,
      '-- ============================================================================',
      '',
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `USE \`${database}\`;`,
      '',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ];

    for (const name of names) {
      const [[row]] = await conn.query(`SHOW CREATE TABLE ${conn.escapeId(name)}`);
      const create = row['Create Table']
        .replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')
        .replace(/ AUTO_INCREMENT=\d+/, '');
      out.push(`-- ${name}`, `${create};`, '');
    }

    out.push('SET FOREIGN_KEY_CHECKS = 1;', '', '-- Stammdaten: Rollen und ihre Rechte');
    for (const name of SEED_TABLES.filter((table) => names.includes(table))) {
      const [rows] = await conn.query({ sql: `SELECT * FROM ${conn.escapeId(name)}`, rowsAsArray: true });
      if (rows.length === 0) continue;
      const values = rows.map((row) => `  (${row.map((value) => conn.escape(value)).join(', ')})`).join(',\n');
      out.push(`INSERT IGNORE INTO ${conn.escapeId(name)} VALUES\n${values};`, '');
    }

    out.push(
      '-- Wer dieses Schema direkt einspielt, hat den Stand ALLER Migrationen –',
      '-- `npm run migrate` soll sie danach nicht noch einmal ausführen.',
      `INSERT IGNORE INTO schema_migrations (filename) VALUES\n${migrations.map((m) => `  (${conn.escape(m.filename)})`).join(',\n')};`,
      ''
    );

    fs.writeFileSync(TARGET, out.join('\n').replace(/\n/g, '\r\n'));
    console.log(`db/schema.sql geschrieben: ${names.length} Tabellen, ${migrations.length} Migrationen.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Schema-Export fehlgeschlagen:', err.code || err.message);
  process.exit(1);
});
