// Einzige Quelle der Hauptnavigation. Wird sowohl von der mobilen
// Bottom-Navigation (<BottomNav>) als auch von der Kopfzeilen-Navigation
// am Desktop (<MainNav>) verwendet – so bleiben beide zwangsläufig synchron.
//
// `icon` ist bewusst nur ein Name: die SVG-Komponenten liegen in
// components/NavIcons.jsx, damit diese Datei reine Daten bleibt.
import { ADMIN_PERMISSIONS } from './roles';

/**
 * @typedef {Object} NavItem
 * @property {string}   to     Zielpfad
 * @property {string}   label  Beschriftung (kurz – steht unter dem Icon)
 * @property {string}   icon   Icon-Name für <NavIcon>
 * @property {boolean}  [end]  Nur bei exakter Übereinstimmung aktiv (Startseite)
 * @property {boolean}  [settings] Einstellungen: mobil letzter Reiter, am Desktop Zahnrad rechts in der Kopfzeile
 * @property {string[]} [permissions] Sichtbar nur mit einem dieser Rechte (ohne = alle)
 */

/** @type {NavItem[]} */
const NAV_ITEMS = [
  { to: '/', label: 'Start', icon: 'home', end: true },
  { to: '/teams', label: 'Teams', icon: 'teams' },
  { to: '/dienste', label: 'Dienste', icon: 'duty' },
  { to: '/verein', label: 'Verein', icon: 'board' },
  {
    to: '/admin',
    label: 'Verwaltung',
    icon: 'shield',
    permissions: ADMIN_PERMISSIONS,
  },
  // Immer ganz rechts: führt zu „Mein Konto“ (Einstellungen, Profil, Einführung).
  { to: '/konto', label: 'Einstellungen', icon: 'settings', settings: true },
];

/**
 * Sichtbare Navigationspunkte.
 * @param {(...keys:string[]) => boolean} can  aus useAuth()
 * @returns {NavItem[]}
 */
export function buildNavItems(can) {
  return NAV_ITEMS.filter((item) => !item.permissions || can(...item.permissions));
}
