const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Verbindung zur XAMPP MySQL-Datenbank
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // Standardmäßig bei XAMPP leer
  database: 'hsg_hinterland'
});

db.connect((err) => {
  if (err) {
    console.error('Fehler bei der Datenbankverbindung:', err);
    return;
  }
  console.log('Erfolgreich mit der XAMPP MySQL-Datenbank verbunden!');
});

// Test-Endpunkt
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend verbindung steht!' });
});

app.listen(5000, () => {
  console.log('Backend-Server läuft auf Port 5000');
});