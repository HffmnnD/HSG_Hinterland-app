// Connection-Pool-Modul für die MySQL-Datenbank `hsg_hinterland`.
// Verwendet die Promise-API von mysql2, damit die Queries mit async/await
// genutzt werden können.
require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // Standardmäßig bei XAMPP leer
  database: process.env.DB_NAME || 'hsg_hinterland',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

// Beim Start einmalig prüfen, ob die Verbindung steht.
pool
  .getConnection()
  .then((connection) => {
    console.log('Erfolgreich mit der MySQL-Datenbank `hsg_hinterland` verbunden!');
    connection.release();
  })
  .catch((err) => {
    console.error(
      'Fehler bei der Datenbankverbindung:',
      err.code || err.message || err
    );
    console.error('Läuft MySQL in XAMPP und existiert die Datenbank `hsg_hinterland`?');
  });

module.exports = pool;
