// Anzeige-Namen und Reihenfolge der RBAC-Rollen.
// Muss zum ENUM in `users.role` passen (siehe backend/utils/roles.js).
export const ROLES = ['admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer'];

export const ROLE_LABELS = {
  admin: 'Admin',
  sub_admin: 'Sub-Admin',
  trainer: 'Trainer',
  spieler: 'Spieler',
  zuschauer: 'Zuschauer',
};

// Rollen mit Zugriff auf die Mitgliederverwaltung.
export const MANAGEMENT_ROLES = ['admin', 'sub_admin', 'trainer'];

// Rollen, die Rolle & Freigabe anderer Konten ändern dürfen.
export const ADMIN_ROLES = ['admin', 'sub_admin'];

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role ?? '—';
}
