// Push-Benachrichtigungen (Web Push) – ein abgeschlossenes Modul.
//
// Eingebunden in server.js mit EINER Zeile:
//
//   require('./push').mount(app);
//
// Was es tut und wie man es wieder entfernt: siehe README.md in diesem Ordner.
const config = require('./config');
const routes = require('./routes');
const triggers = require('./triggers');
const reminders = require('./reminders');

function mount(app) {
  app.use('/api/push', routes);

  if (!config.enabled) {
    console.log('Push: keine VAPID-Schlüssel gesetzt – Benachrichtigungen sind aus (npm run push:keys).');
    return;
  }
  triggers.register();
  reminders.start();
  console.log('Push: Benachrichtigungen aktiv.');
}

module.exports = { mount };
