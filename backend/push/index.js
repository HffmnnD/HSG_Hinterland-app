// Push-Benachrichtigungen (Web Push) – ein abgeschlossenes Modul.
//
// Eingebunden in server.js mit EINER Zeile:
//
//   require('./push').mount(app);
//
// Was es tut und wie man es wieder entfernt: siehe README.md in diesem Ordner.
const config = require('./config');

/** Ist das Paket `web-push` installiert? */
function hasWebPush() {
  try {
    require.resolve('web-push');
    return true;
  } catch {
    return false;
  }
}

function mount(app) {
  // Fehlt das Paket (z. B. nach dem Einspielen ohne `npm install`), darf das
  // den Server nicht umwerfen: Push bleibt dann aus, alles andere läuft.
  if (!hasWebPush()) {
    console.warn('Push: Paket „web-push" fehlt – im Ordner backend `npm install` ausführen. Push ist aus.');
    app.get('/api/push/config', (req, res) => res.json({ enabled: false, publicKey: null }));
    return;
  }

  app.use('/api/push', require('./routes'));

  if (!config.enabled) {
    console.log('Push: keine VAPID-Schlüssel gesetzt – Benachrichtigungen sind aus (npm run push:keys).');
    return;
  }
  require('./triggers').register();
  require('./reminders').start();
  console.log('Push: Benachrichtigungen aktiv.');
}

module.exports = { mount };
