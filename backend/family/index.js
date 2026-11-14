// Eltern-Kind-Verknüpfung – eingebunden in server.js mit
//   require('./family').mount(app);
// Braucht Migration 020 und 023.
function mount(app) {
  const routes = require('./routes');
  // Zuerst die öffentlichen Pfade (Einladungscode prüfen), dann der Rest hinter Login.
  app.use('/api/family', routes.publicRouter);
  app.use('/api/family', routes);
}

module.exports = { mount };
