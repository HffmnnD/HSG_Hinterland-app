/**
 * Rundes Bild einer Person – Profilbild, sonst die Initialen.
 *
 * Eine Komponente für alle Stellen (Startseite, Kader, Verwaltung), damit ein
 * Mitglied überall gleich aussieht und die Rückfallebene nur einmal existiert:
 * Ohne Foto stehen die Initialen im getönten Kreis, wie vor der Einführung der
 * Profilbilder.
 *
 * @param {{ person: { firstName?:string, lastName?:string, photoUrl?:string|null },
 *           size?: 'sm'|'md'|'lg'|'xl',
 *           className?: string }} props
 */

const SIZES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

export default function Avatar({ person, size = 'md', className = '' }) {
  const initials = `${person?.firstName?.[0] ?? ''}${person?.lastName?.[0] ?? ''}`
    .toUpperCase()
    .trim();

  if (person?.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        // Dekorativ: Der Name steht in jeder Verwendung direkt daneben.
        alt=""
        loading="lazy"
        className={`${SIZES[size]} shrink-0 rounded-full border border-line object-cover ${className}`}
      />
    );
  }

  return (
    <span aria-hidden="true" className={`avatar ${SIZES[size]} ${className}`}>
      {initials || '?'}
    </span>
  );
}
