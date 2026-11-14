// Kalender-Export und -Abo (iCal). Eingebunden in server.js mit
//   require('./calendar').mount(app);
// Braucht Migration 018 (users.calendar_token).
function mount(app) {
  app.use('/api/calendar', require('./routes'));
}

module.exports = { mount };
