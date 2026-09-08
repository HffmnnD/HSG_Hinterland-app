// Migrations-Runner: führt neue SQL-Dateien aus db/migrations/ genau EINMAL aus.
//
//   npm run migrate
//
// Bereits angewendete Dateien werden in der Tabelle `schema_migrations`
// vermerkt und beim nächsten Lauf übersprungen. So dürfen Migrationen auch
// nicht-idempotente Daten-Backfills enthalten (z. B. "alle Bestandsdaten auf
// bestätigt setzen"), ohne bei einem zweiten Lauf Schaden anzurichten.
//
// Defensiv wird zusätzlich "existiert bereits" (Tabelle/Spalte/Key schon da)
// abgefangen – falls jemand das Schema von Hand angelegt hat.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const IGNORABLE = new Set([
  'ER_TABLE_EXISTS_ERROR', // 1050
  'ER_DUP_FIELDNAME', // 1060
  'ER_DUP_KEYNAME', // 1061
  'ER_CANT_CREATE_TABLE', // 1005 (FK schon vorhanden)
  'ER_FK_DUP_NAME', // 1826
]);

// Zerlegt eine SQL-Datei in einzelne Statements (Kommentarzeilen entfernt).
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function runFile(conn, file) {
  const statements = splitStatements(
    fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
  );
  let applied = 0;
  let skipped = 0;

  for (const statement of statements) {
    try {
      await conn.query(statement);
      applied += 1;
    } catch (err) {
      if (IGNORABLE.has(err.code)) {
        skipped += 1;
      } else {
        console.error(`\n✗ ${file}\n  Statement: ${statement.slice(0, 120)}…`);
        throw err;
      }
    }
  }

  await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
  console.log(
    `✓ ${file}  (${applied} ausgeführt${skipped ? `, ${skipped} übersprungen` : ''})`
  );
}

async function main() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('Keine Migrationen gefunden.');
    return;
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hsg_hinterland',
    multipleStatements: false,
  });

  try {
    await ensureMigrationsTable(connection);
    const [rows] = await connection.query(
      'SELECT filename FROM schema_migrations'
    );
    const done = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (done.has(file)) {
        console.log(`• ${file}  (bereits angewendet)`);
        continue;
      }
      await runFile(connection, file);
      ran += 1;
    }

    console.log(
      ran === 0
        ? '\nNichts zu tun – Datenbank ist aktuell.'
        : `\n${ran} Migration(en) angewendet.`
    );
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nMigration fehlgeschlagen:', err.code || err.message);
  process.exit(1);
});
