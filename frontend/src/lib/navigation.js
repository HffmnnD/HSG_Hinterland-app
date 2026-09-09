// Einzige Quelle der Hauptnavigation. Wird sowohl von der mobilen
// Bottom-Navigation (<BottomNav>) als auch von der Kopfzeilen-Navigation
// am Desktop (<MainNav>) verwendet – so bleiben beide zwangsläufig synchron.
//
// `icon` ist bewusst nur ein Name: die SVG-Komponenten liegen in
// components/NavIcons.jsx, damit diese Datei reine Daten bleibt.
import { MANAGEMENT_ROLES } from './roles';

/**
 * @typedef {Object} NavItem
 * @property {string}   to     Zielpfad
 * @property {string}   label  Beschriftung (kurz – steht unter dem Icon)
 * @property {string}   icon   Icon-Name für <NavIcon>
 * @property {boolean}  [end]  Nur bei exakter Übereinstimmung aktiv (Startseite)
 * @property {string[]} [roles] Sichtbar nur für diese Rollen (ohne = alle)
 */

/** @type {NavItem[]} */
const NAV_ITEMS = [
  { to: '/', label: 'Start', icon: 'home', end: true },
  { to: '/teams', label: 'Teams', icon: 'teams' },
  { to: '/termine', label: 'Termine', icon: 'calendar' },
  {
    to: '/admin',
    label: 'Verwaltung',
    icon: 'shield',
    roles: MANAGEMENT_ROLES,
  },
];

/**
 * Für die Rolle sichtbare Navigationspunkte.
 * @param {string|null} role
 * @returns {NavItem[]}
 */
export function buildNavItems(role) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
