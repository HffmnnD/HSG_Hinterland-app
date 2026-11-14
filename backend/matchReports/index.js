// Spielberichte (Uploads je Mannschaft) – eingebunden in server.js mit
//   require('./matchReports').mount(app);
// und zwar VOR der statischen Auslieferung von /api/uploads.
// Braucht Migration 022.
const { SUBDIR } = require('./upload');

function mount(app) {
  // Die Dateien liegen unter uploads/match-reports/, sind aber
  // mannschaftsintern: NICHT über die allgemeine Bild-Auslieferung
  // /api/uploads (die jedem angemeldeten Konto offensteht), sondern nur über
  // /api/match-reports/:id/files/:fileId mit Rechteprüfung.
  app.use(`/api/uploads/${SUBDIR}`, (req, res) => {
    res.status(404).json({ message: 'Nicht gefunden.' });
  });
  app.use('/api/match-reports', require('./routes'));
}

module.exports = { mount };
