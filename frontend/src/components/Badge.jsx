/**
 * Kompakter Status-Chip im Vereinslook (Oswald, versal).
 *
 * Wird für Zustände verwendet (Spielstatus, „Nicht aktuell"), NICHT mehr für
 * Rollen: die Rolle einer Person gehört nicht neben jede Seitenüberschrift.
 *
 * @param {'neutral'|'admin'|'trainer'|'pending'|'confirmed'|'live'} [variant]
 */
export function Badge({ variant = 'neutral', className = '', children }) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>;
}
