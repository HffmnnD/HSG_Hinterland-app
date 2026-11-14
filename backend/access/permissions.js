// Katalog aller Vereinsrechte – die EINZIGE Liste, gegen die geprüft wird.
//
// Ein Recht steht für genau eine Funktion. Rollen bündeln Rechte (Tabelle
// role_permissions), einzelne Personen können zusätzlich Rechte bekommen oder
// entzogen bekommen (user_permissions). Neue Funktion = neuer Eintrag hier,
// dann taucht sie automatisch im Rechte-Editor der Verwaltung auf.
//
// Mannschaftsrechte (Kader und Termine EINER Mannschaft) stehen bewusst nicht
// hier: Sie folgen der Zuordnung „coach" in user_teams.

const GROUPS = [
  { key: 'members', label: 'Mitglieder' },
  { key: 'access', label: 'Rollen & Rechte' },
  { key: 'teams', label: 'Mannschaften' },
  { key: 'content', label: 'News' },
  { key: 'club', label: 'Vereinsleben' },
  { key: 'duties', label: 'Dienste' },
  { key: 'family', label: 'Familie' },
  { key: 'system', label: 'System' },
];

const PERMISSIONS = [
  { key: 'members.view', group: 'members', label: 'Mitgliederliste sehen', description: 'Öffnet die Mitgliederverwaltung (ohne Kontaktdaten).' },
  { key: 'members.contact', group: 'members', label: 'Kontaktdaten sehen', description: 'E-Mail und Telefon aller Mitglieder.' },
  { key: 'members.edit', group: 'members', label: 'Mitglieder bearbeiten', description: 'Mannschaften und Helferdienste beliebiger Mitglieder ändern.' },
  { key: 'members.lock', group: 'members', label: 'Konten sperren', description: 'Konten sperren und wieder freigeben.' },
  { key: 'members.roles', group: 'members', label: 'Rollen zuweisen', description: 'Grund- und Zusatzrollen vergeben – nur Rollen, deren Rechte man selbst hat.' },
  { key: 'access.manage', group: 'access', label: 'Rechte verwalten', description: 'Rollen anlegen, ändern und Einzelrechte vergeben oder entziehen.' },
  { key: 'teams.create', group: 'teams', label: 'Mannschaften anlegen', description: 'Neue Mannschaften anlegen.' },
  { key: 'teams.edit', group: 'teams', label: 'Stammdaten pflegen', description: 'Name, nuLiga-Nummer und Foto jeder Mannschaft.' },
  { key: 'teams.manage_all', group: 'teams', label: 'Alle Mannschaften verwalten', description: 'Kader und Termine jeder Mannschaft – wie Trainer:in überall.' },
  { key: 'news.manage', group: 'content', label: 'News veröffentlichen', description: 'Beiträge anlegen, bearbeiten, archivieren und löschen.' },
  { key: 'board.manage', group: 'club', label: 'Vereinsinfos pflegen', description: 'Spielberichte und Dokumente unter Verein → Infos einstellen, ändern und löschen.' },
  { key: 'events.manage', group: 'club', label: 'Vereinstermine planen', description: 'Veranstaltungen anlegen, Rückmeldungen abfragen und auswerten.' },
  { key: 'duties.manage', group: 'duties', label: 'Dienstpläne verwalten', description: 'Pläne anlegen, veröffentlichen, Personen eintragen.' },
  { key: 'family.manage', group: 'family', label: 'Familien verwalten', description: 'Eltern-Kind-Verknüpfungen anlegen und lösen.' },
  { key: 'system.view', group: 'system', label: 'System-Monitoring', description: 'Serverauslastung, Zugriffe und Cache.' },
  { key: 'backups.manage', group: 'system', label: 'Datensicherungen', description: 'Sicherungen der Datenbank erstellen, herunterladen und löschen.' },
  { key: 'settings.manage', group: 'system', label: 'Vereinseinstellungen', description: 'Vereinsweite Einstellungen, z. B. Sichtbarkeit bei Diensten.' },
];

const PERMISSION_KEYS = PERMISSIONS.map((entry) => entry.key);
const PERMISSION_SET = new Set(PERMISSION_KEYS);

const isPermission = (value) => typeof value === 'string' && PERMISSION_SET.has(value);

module.exports = { GROUPS, PERMISSIONS, PERMISSION_KEYS, isPermission };
