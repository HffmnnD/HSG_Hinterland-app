// Einfacher Migrations-Runner: führt alle SQL-Dateien in db/migrations/
// alphabetisch sortiert aus.
//
//   npm run migrate
//
// Die Migrationen sind so geschrieben, dass sie mehrfach ausgeführt werden
// können. Fehler, die "existiert bereits" bedeuten (Tabelle/Spalte/Key schon
// vorhanden), werden übersprungen, damit ältere, nicht-idempotente Migrationen
// nicht stören.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// MySQL-Fehlercodes, die ein bereits angewandtes DDL bedeuten.
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
    for (const file of files) {
      const statements = splitStatements(
        fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      );
      let applied = 0;
      let skipped = 0;

      for (const statement of statements) {
        try {
          await connection.query(statement);
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

      console.log(
        `✓ ${file}  (${applied} ausgeführt${skipped ? `, ${skipped} übersprungen` : ''})`
      );
    }

    console.log('\nAlle Migrationen abgeschlossen.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('\nMigration fehlgeschlagen:', err.code || err.message);
  process.exit(1);
});
