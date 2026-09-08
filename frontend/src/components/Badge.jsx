import { roleBadge } from '../lib/roles';

/**
 * Kompakter Status-/Rollen-Chip im Vereinslook (Oswald, versal).
 *
 * @param {'neutral'|'admin'|'trainer'|'pending'|'confirmed'} [variant]
 */
export function Badge({ variant = 'neutral', className = '', children }) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>;
}

/**
 * Rollen-Badge (ADMIN / SUB-ADMIN / TRAINER). Für Spieler:in/Zuschauer:in
 * bewusst nichts – dort genügt das Rollen-Label im Fließtext.
 */
export function RoleBadge({ role, className = '' }) {
  const label = roleBadge(role);
  if (!label) return null;
  const variant = role === 'trainer' ? 'trainer' : 'admin';
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
