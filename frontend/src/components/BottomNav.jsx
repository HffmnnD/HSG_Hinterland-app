import { NavLink } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { buildNavItems } from '../lib/navigation';
import NavIcon from './NavIcons';

/**
 * Mobile Hauptnavigation, fest am unteren Bildschirmrand (PWA-Look).
 *
 * Ab `md` ausgeblendet – dort navigiert <MainNav> in der Kopfzeile.
 * Die Reiter kommen aus lib/navigation.js und sind rollenabhängig
 * (Verwaltung nur für admin, sub_admin und trainer).
 *
 * Seiten, die diese Leiste zeigen, brauchen unten `pb-bottom-nav`
 * (übernimmt <AppLayout>), damit nichts verdeckt wird.
 */
export default function BottomNav() {
  const { role } = useAuth();
  const items = buildNavItems(role);

  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <ul
        className="bottom-nav__list"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.to}>
            {/* NavLink setzt bei der aktiven Route automatisch
                aria-current="page" – zusätzlich markieren wir sie farblich. */}
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`
              }
            >
              <NavIcon name={item.icon} className="h-6 w-6" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
