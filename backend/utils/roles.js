// Zentrale Rollen-Definitionen (müssen zum ENUM in `users.role` passen).

const ROLES = ['admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer'];

// Rollen mit Zugriff auf die Verwaltungs-Endpunkte (/api/admin/*).
const MANAGEMENT_ROLES = ['admin', 'sub_admin', 'trainer'];

// Rollen, die Rolle & Freigabe anderer Konten ändern dürfen.
const ADMIN_ROLES = ['admin', 'sub_admin'];

// Art der Beziehung zwischen Nutzer und Mannschaft.
const RELATION_TYPES = ['player', 'coach', 'fan'];

// Helferdienste.
const SERVICE_TYPES = ['zeitnehmer', 'verkaufsdienst'];

module.exports = {
  ROLES,
  MANAGEMENT_ROLES,
  ADMIN_ROLES,
  RELATION_TYPES,
  SERVICE_TYPES,
};
