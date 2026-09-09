import { NavLink } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { buildNavItems } from '../lib/navigation';

/**
 * Hauptnavigation in der Kopfzeile – nur ab `md` sichtbar.
 * Auf kleineren Bildschirmen übernimmt <BottomNav>.
 *
 * Die Reiter stammen aus derselben Quelle wie die Bottom-Navigation
 * (lib/navigation.js), inklusive Rollenfilter.
 */
export default function MainNav() {
  const { role } = useAuth();
  const items = buildNavItems(role);

  return (
    <nav className="main-nav" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `main-nav__item ${isActive ? 'main-nav__item--active' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
