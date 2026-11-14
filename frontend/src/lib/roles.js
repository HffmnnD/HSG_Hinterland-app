// Anzeige-Namen der Grundrollen (users.role) und die Rechte, mit denen man
// überhaupt in die Verwaltung kommt. Welche Rechte es gibt, liefert das
// Backend (GET /api/access/catalog) – hier steht bewusst keine zweite Liste.
const ROLE_LABELS = {
  admin: 'Admin',
  sub_admin: 'Hauptuser',
  trainer: 'Trainer:in',
  spieler: 'Spieler:in',
  zuschauer: 'Zuschauer:in',
};

// Mindestens eines davon öffnet den Reiter „Verwaltung".
export const ADMIN_PERMISSIONS = [
  'members.view',
  'access.manage',
  'news.manage',
  'teams.create',
  'teams.edit',
  'system.view',
  'family.manage',
  'settings.manage',
  'backups.manage',
];

export function roleLabel(role, roles) {
  const fromServer = roles?.find?.((entry) => entry.key === role)?.name;
  return fromServer ?? ROLE_LABELS[role] ?? role ?? '—';
}
