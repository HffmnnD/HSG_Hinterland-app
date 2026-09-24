import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../../context/ThemeContext';

/**
 * Rahmen der Anmeldeseite: anthrazitfarbene Fläche in Markenfarbe, darauf die
 * Karte mit dem Formular.
 *
 * Der Umschalter für Hell/Dunkel steht auch hier – wer die App im Dunkeln
 * benutzt, soll nicht erst von einer hellen Anmeldemaske geblendet werden.
 * Angemeldet ist noch niemand, die Wahl landet also zunächst nur im Browser
 * und wandert beim ersten Login ins Profil.
 */
export default function AuthLayout({ children }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-hsg-dark text-white">
      <div className="brand-ribbon" />

      <div className="flex justify-end px-4 pt-3">
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Zum hellen Design wechseln' : 'Zum dunklen Design wechseln'}
          aria-label={
            isDark ? 'Helles Design einschalten' : 'Dunkles Design einschalten'
          }
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 text-white/80 transition-colors hover:border-white/40 hover:text-white"
        >
          {isDark ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-10 pt-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-hsg-green font-display text-2xl font-bold leading-none text-white">
              H
            </div>
            <p className="eyebrow text-hsg-green">
              Ehrlicher Sport &middot; Direkt vor Ort
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.03em] text-white">
              HSG Hinterland
            </h1>
            <p className="mt-1.5 text-sm text-white/60">
              Vereins-App für Mannschaften, Kalender &amp; Dienste
            </p>
          </div>

          <div className="rounded-md border-t-[3px] border-t-hsg-green bg-paper p-6 text-ink-soft shadow-pop">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-white/45">
            © {new Date().getFullYear()} HSG Hinterland
          </p>
        </div>
      </div>
    </div>
  );
}
