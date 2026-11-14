import { NavLink } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { buildNavItems } from '../lib/navigation';
import NavIcon from './NavIcons';

/**
 * Mobile Hauptnavigation, fest am unteren Bildschirmrand (PWA-Look).
 *
 * Ab `md` ausgeblendet – dort navigiert <MainNav> in der Kopfzeile. Die
 * Reiter kommen aus lib/navigation.js (Verwaltung nur mit passendem Recht).
 * Im Querformat am Handy wird die Leiste niedriger, damit mehr Inhalt bleibt.
 */
export default function BottomNav() {
  const { can } = useAuth();
  const items = buildNavItems(can);

  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <ul
        className="bottom-nav__list"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`
              }
            >
              <span className="relative">
                <NavIcon name={item.icon} className="h-6 w-6" />
              </span>
              <span className="bottom-nav__label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
