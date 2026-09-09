/**
 * Icon-Satz der Hauptnavigation.
 *
 * Bewusst als Inline-SVG statt als Icon-Bibliothek: vier schlichte
 * Strich-Icons rechtfertigen keine zusätzliche Abhängigkeit im PWA-Bundle.
 * Alle Icons nutzen `currentColor`, übernehmen also automatisch den
 * Zustand (aktiv = Vereinsgrün) des umgebenden Links.
 */

const PATHS = {
  home: (
    <>
      <path d="M3.25 10.75 12 3.5l8.75 7.25" />
      <path d="M5.5 9.9V19.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.9" />
      <path d="M9.75 20.5v-5.25h4.5v5.25" />
    </>
  ),
  teams: (
    <>
      <circle cx="9.25" cy="8.25" r="3.25" />
      <path d="M3.25 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.35a3.25 3.25 0 0 1 0 5.8" />
      <path d="M17.4 13.6a6 6 0 0 1 3.35 5.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.25" y="5.25" width="17.5" height="15.5" rx="2" />
      <path d="M8 3.25v4M16 3.25v4M3.25 10.25h17.5" />
      <path d="M7.75 13.75h3.5v3.5h-3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.25l7.25 2.6v5.4c0 4.4-2.95 7.9-7.25 9.5-4.3-1.6-7.25-5.1-7.25-9.5v-5.4L12 3.25Z" />
      <path d="m9 12.1 2.15 2.15L15.25 10" />
    </>
  ),
};

/**
 * @param {{ name: keyof typeof PATHS, className?: string }} props
 */
export default function NavIcon({ name, className = 'h-6 w-6' }) {
  const paths = PATHS[name];
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}
