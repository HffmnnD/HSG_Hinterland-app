import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import AppHeader from './AppHeader';
import BottomNav from './BottomNav';
import Brand from './Brand';
import InstallHint from './InstallHint';
import MainNav, { SettingsButton } from './MainNav';
import Avatar from './ui/Avatar';
import PersonSwitcher from './family/PersonSwitcher';
import AppTour from './tour/AppTour';

/**
 * Gemeinsames Gerüst aller geschützten Seiten:
 *
 *   [Hinweisband, solange Eltern im Kinderkonto sind]
 *   grüner Marken-Streifen + Kopfzeile (Marke | Navigation | eigenes Bild)
 *   Inhalt (mit Platz für die Bottom-Navigation)
 *   mobile Bottom-Navigation
 *
 * Das Bild oben rechts zeigt die Person, für die gerade gehandelt wird. Ohne
 * Kinder führt es zu „Mein Konto" – dort liegen
 * Einstellungen, Familie, Startseite und Abmelden. So bleibt die Kopfzeile
 * am Handy aufgeräumt.
 *
 * @param {string}          [width]   Tailwind max-width der Inhaltsspalte
 * @param {React.ReactNode} [header]  Ersetzt die Marke links (z. B. Mannschaftsname)
 * @param {React.ReactNode} [actions] Zusätzliche Schaltflächen rechts
 */
export default function AppLayout({ width = 'max-w-3xl', header, actions, children }) {
  const { actingAs } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      {actingAs && <ActingBanner />}
      {/* Kopfzeile immer gleich breit – unabhängig von der Inhaltsbreite der Seite. */}
      <AppHeader width="max-w-6xl">
        {header ?? <Brand to="/" />}

        <div className="flex shrink-0 items-center gap-1.5">
          <MainNav />
          {actions}
          <SettingsButton />
          <PersonSwitcher />
        </div>
      </AppHeader>

      <main className={`app-main ${width} pb-bottom-nav`}>
        {/* Hinweis „Als App installieren" – nur auf der Startseite, im Browser. */}
        {pathname === '/' && <InstallHint />}
        {children}
      </main>

      <BottomNav />
      {/* Einführung: einmal nach der Kontoeröffnung, sonst über Einstellungen. */}
      <AppTour />
    </div>
  );
}

/**
 * Band über allen Seiten, solange Eltern für ein Kind handeln: Bild und Name
 * des Kindes, bei mehreren Kindern ein Direktwechsel zu den Geschwistern und
 * „Zurück zu mir". Die Farbe hebt sich bewusst von der normalen App ab.
 */
function ActingBanner() {
  const { user, actingAs, family, switchAccount } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const siblings = family.filter((child) => child.id !== user?.id);

  const go = async (id, target) => {
    setBusy(true);
    await switchAccount(id);
    setBusy(false);
    navigate(target);
  };

  return (
    <div className="acting-banner" role="status">
      <span className="flex min-w-0 items-center gap-2">
        <Avatar person={user} size="xs" />
        <span className="min-w-0 truncate">
          Du handelst für {user?.firstName}
          <span className="hidden font-normal sm:inline"> · angemeldet als {actingAs.actorName}</span>
        </span>
      </span>
      {siblings.length > 0 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          {siblings.map((child) => (
            <button
              key={child.id}
              type="button"
              disabled={busy}
              onClick={() => go(child.id, '/')}
              title={`Zu ${child.firstName} wechseln`}
              className="inline-flex items-center gap-1 rounded-sm bg-white/10 px-2 py-1 text-xs hover:bg-white/25"
            >
              <Avatar person={child} size="xs" /> {child.firstName}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        onClick={() => go(null, '/konto?bereich=familie')}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-white/20 px-2.5 py-1 text-xs hover:bg-white/30"
      >
        <ArrowLeftRight size={14} aria-hidden="true" />
        Zurück zu mir
      </button>
    </div>
  );
}
