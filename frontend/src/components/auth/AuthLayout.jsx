import { useBranding } from '../../hooks/useBranding';

/**
 * Rahmen der Anmeldeseite.
 *
 * Handy: Marke oben auf dunkler Fläche, darunter die Formularkarte.
 * Ab `lg`: zweigeteilt – links die Vereinsfläche mit Bild oder Verlauf
 * (Bild und Sprüche aus Verwaltung → App-Einstellungen; ohne Bild der
 * Verlauf aus src/design.css), rechts das Formular.
 *
 * Bewusst ohne Hell/Dunkel-Umschalter: Wer noch nicht angemeldet ist, hat
 * noch kein Profil, in dem die Wahl gespeichert werden könnte.
 */
export default function AuthLayout({ children }) {
  const { logoUrl, loginImageUrl, loginTitle, loginText } = useBranding();
  return (
    <div className="grid min-h-[100dvh] bg-surface lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside
        className="auth-visual relative flex flex-col justify-between overflow-hidden px-6 pb-16 pt-10 text-white sm:px-10 lg:pb-10"
        style={loginImageUrl ? { '--image-login': `url("${loginImageUrl}")` } : undefined}
      >
        <div className="relative flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-11 w-11 rounded-[10px] object-contain" />
          ) : (
            <span className="brand__mark h-11 w-11 text-xl" aria-hidden="true">
              H
            </span>
          )}
          <span className="font-display text-lg font-bold tracking-[-0.01em]">HSG Hinterland</span>
        </div>

        {(loginTitle || loginText) && (
          <div className="relative mt-10 max-w-md lg:mt-0">
            {loginTitle && (
              <h1 className="font-display text-3xl font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-4xl">
                {loginTitle}
              </h1>
            )}
            {loginText && <p className="mt-3 text-[0.9375rem] text-white/70">{loginText}</p>}
          </div>
        )}

        <p className="relative mt-8 hidden text-xs text-white/45 lg:block">
          © {new Date().getFullYear()} HSG Hinterland
        </p>
      </aside>

      <main className="relative z-10 -mt-8 flex items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:px-10">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-line bg-paper p-6 text-ink-soft shadow-pop sm:p-8">
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-ink-muted lg:hidden">
            © {new Date().getFullYear()} HSG Hinterland
          </p>
        </div>
      </main>
    </div>
  );
}
