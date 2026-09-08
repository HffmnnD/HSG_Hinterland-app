// Anzeige-Namen und Reihenfolge der RBAC-Rollen.
export const ROLES = ['admin', 'trainer', 'spieler', 'zuschauer'];

export const ROLE_LABELS = {
  admin: 'Admin',
  trainer: 'Trainer',
  spieler: 'Spieler',
  zuschauer: 'Zuschauer',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role ?? '—';
}
