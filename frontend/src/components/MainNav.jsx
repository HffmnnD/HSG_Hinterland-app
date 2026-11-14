import { NavLink } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { buildNavItems } from '../lib/navigation';
import NavIcon from './NavIcons';

/**
 * Hauptnavigation in der Kopfzeile – nur ab `md` sichtbar.
 * Auf kleineren Bildschirmen übernimmt <BottomNav>. Gleiche Quelle
 * (lib/navigation.js), gleicher Rechte-Filter. Die Einstellungen stehen am
 * Desktop nicht als Text-Reiter, sondern als Zahnrad ganz rechts.
 */
export default function MainNav() {
  const { can } = useAuth();
  const items = buildNavItems(can).filter((item) => !item.settings);

  return (
    <nav className="main-nav" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `main-nav__item ${isActive ? 'main-nav__item--active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Zahnrad „Einstellungen" für die Kopfzeile am Desktop (mobil: letzter Reiter unten). */
export function SettingsButton() {
  return (
    <NavLink
      to="/konto"
      aria-label="Einstellungen"
      title="Einstellungen"
      className={({ isActive }) =>
        `hidden h-10 w-10 items-center justify-center rounded-full md:inline-flex ${
          isActive ? 'bg-hsg-green-soft text-hsg-green-dark' : 'text-ink-soft hover:bg-surface hover:text-ink'
        }`
      }
    >
      <NavIcon name="settings" className="h-5 w-5" />
    </NavLink>
  );
}
