// Infothek – eingebunden in server.js mit
//   require('./library').mount(app);
// und zwar VOR der statischen Auslieferung von /api/uploads. Braucht Migration 030.
//
// Dokumente unter Verein → Infos: /api/library/entries?scope=board
// (Mannschafts- und Trainerbereich wurden mit Migration 035 entfernt.)
const { files } = require('./routes');

function mount(app) {
  files.blockStatic(app);
  app.use('/api/library', require('./routes').router);
}

module.exports = { mount };
