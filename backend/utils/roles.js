// Zentrale Rollen-Definitionen (müssen zum ENUM in `users.role` passen).

const ROLES = ['admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer'];


// Wer was darf, steht NICHT mehr hier, sondern in access/permissions.js
// (Rechte) und in der Tabelle roles (Migration 019).

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
  RELATION_TYPES,
  SELF_RELATION_TYPES,
  SERVICE_TYPES,
  THEMES,
};
