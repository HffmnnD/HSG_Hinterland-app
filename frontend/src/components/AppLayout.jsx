import { useState } from 'react';

import { useAuth } from '../context/AuthContext';
import AppHeader from './AppHeader';
import BottomNav from './BottomNav';
import Brand from './Brand';
import MainNav from './MainNav';

/**
 * Gemeinsames Gerüst aller geschützten Seiten:
 *
 *   grüner Marken-Streifen + Kopfzeile (Marke | Navigation + Abmelden)
 *   Inhalt (mit Platz für die Bottom-Navigation)
 *   mobile Bottom-Navigation
 *
 * Navigiert wird ab `md` über <MainNav> in der Kopfzeile, darunter über
 * <BottomNav> am unteren Rand – beide speisen sich aus lib/navigation.js.
 *
 * @param {string}          [width]   Tailwind max-width der Inhaltsspalte
 * @param {React.ReactNode} [header]  Ersetzt die Marke links (z. B. Mannschaftsname)
 * @param {React.ReactNode} [actions] Zusätzliche Schaltflächen rechts vor „Abmelden"
 */
export default function AppLayout({
  width = 'max-w-3xl',
  header,
  actions,
  children,
}) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    // Kein setState mehr nötig: Komponente wird nach dem Logout unmounted.
  };

  return (
    <div className="app-shell">
      <AppHeader width={width}>
        {header ?? <Brand to="/" />}

        <div className="flex shrink-0 items-center gap-1.5">
          <MainNav />
          {actions}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="btn btn-outline btn-sm"
          >
            {loggingOut ? 'Abmelden …' : 'Abmelden'}
          </button>
        </div>
      </AppHeader>

      <main className={`app-main ${width} pb-bottom-nav`}>{children}</main>

      <BottomNav />
    </div>
  );
}
