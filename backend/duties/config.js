// Grenzen und Fristen des Dienstplans.
module.exports = {
  // Selbst austragen geht bis so viele Tage vor Beginn, danach nur noch über
  // Admin oder Sub-Admin.
  // Plätze je Dienst.
  MAX_CAPACITY: 50,
  // Dienste in einer Anfrage (Vorlage) und in einem Plan.
  MAX_DUTIES_PER_REQUEST: 100,
  MAX_DUTIES_PER_PLAN: 300,
  // Ein Dienst dauert höchstens so lange.
  MAX_DUTY_MINUTES: 24 * 60,
  // So weit im Voraus darf ein Dienst liegen.
  MAX_DAYS_AHEAD: 730,
  MAX_TITLE_LENGTH: 120,
  MAX_LOCATION_LENGTH: 150,
  MAX_NOTES_LENGTH: 1000,
};
