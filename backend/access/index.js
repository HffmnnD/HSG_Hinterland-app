// Rollen und Rechte – eingebunden in server.js mit
//   require('./access').mount(app);
// Braucht Migration 019. Ohne sie gelten die alten, festen Rollen (siehe
// service.js, LEGACY).
const service = require('./service');

function mount(app) {
  app.use('/api/access', require('./routes'));
  service.hasAccessTables().catch(() => {});
}

module.exports = { mount };
