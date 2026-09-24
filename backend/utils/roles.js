// Zentrale Rollen-Definitionen (müssen zum ENUM in `users.role` passen).

const ROLES = ['admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer'];

// Rollen mit Zugriff auf die Verwaltungs-Endpunkte (/api/admin/*).
const MANAGEMENT_ROLES = ['admin', 'sub_admin', 'trainer'];

// Rollen, die Rolle & Freigabe anderer Konten ändern dürfen.
const ADMIN_ROLES = ['admin', 'sub_admin'];

// Art der Beziehung zwischen Nutzer und Mannschaft.
const RELATION_TYPES = ['player', 'coach', 'fan'];

// Beziehungen, die ein Mitglied im Onboarding oder unter „Mein Konto" selbst
// wählen darf. `fan` gilt sofort, `player`/`coach` sind Anfragen an die
// Trainer:innen der Mannschaft (siehe teamRepository.initialConfirmation).
const SELF_RELATION_TYPES = ['player', 'coach', 'fan'];

// Helferdienste.
const SERVICE_TYPES = ['zeitnehmer', 'verkaufsdienst'];

// Design-Vorliebe (muss zum ENUM in `users.theme` passen).
const THEMES = ['system', 'light', 'dark'];

module.exports = {
  ROLES,
  MANAGEMENT_ROLES,
  ADMIN_ROLES,
  RELATION_TYPES,
  SELF_RELATION_TYPES,
  SERVICE_TYPES,
  THEMES,
};
