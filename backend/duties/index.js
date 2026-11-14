// Dienstplan – ein abgeschlossenes Modul wie push/.
//
// Eingebunden in server.js mit EINER Zeile:
//
//   require('./duties').mount(app);
//
// Aufbau und Entfernen: siehe README.md in diesem Ordner.
const pool = require('../config/db');

function mount(app) {
  app.use('/api/duties', require('./routes'));

  // Ohne Migration 017 fehlen die Dienst-Tabellen. Lieber beim Start laut
  // sagen als später rätseln.
  pool
    .query("SHOW TABLES LIKE 'duty_plans'")
    .then(([rows]) => {
      if (rows.length === 0) {
        console.error('Dienstplan: Migration 017 fehlt. Bitte im Ordner backend `npm run migrate` ausführen.');
      }
    })
    .catch(() => {});
}

module.exports = { mount };
