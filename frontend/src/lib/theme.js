// Werte und Browser-Zugriffe des Themas (Hell / Dunkel).
//
// Bewusst getrennt von context/ThemeContext.jsx: Dort steht die React-Logik,
// hier die reinen Daten und die drei Berührungspunkte mit dem Browser
// (localStorage, Media Query, Farbe der Adressleiste). Damit können auch
// andere Bauteile die Liste der Einstellungen nutzen, ohne den Kontext zu
// importieren.

/** Die drei Einstellungen. Muss zum ENUM in `users.theme` passen. */
export const THEMES = ['system', 'light', 'dark'];

/**
 * Schlüssel der lokalen Kopie. Er steht ZUSÄTZLICH im Inline-Skript in
 * index.html, das das Thema vor dem ersten Bild setzt – wer ihn hier ändert,
 * muss ihn dort mitändern.
 */
export const THEME_STORAGE_KEY = 'hsg-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Wert einer Variable aus src/design.css (für das aktuelle Thema). */
export function designValue(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Schriftdatei laden, deren Adresse in src/design.css (`--font-url`) steht.
 * Ein `@import url(…)` in der CSS-Datei überlebt den Tailwind-Build nicht –
 * deshalb hängt die App den Link beim Start selbst in den <head>.
 */
export function loadDesignFonts() {
  const href = designValue('--font-url').replace(/^['"]|['"]$/g, '');
  if (!href || document.querySelector('link[data-design-fonts]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.designFonts = '';
  document.head.appendChild(link);
}

/** Gespeicherte Wahl. null, wenn nichts oder Unbekanntes gespeichert ist. */
export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : null;
  } catch {
    // Privater Modus / Speicher gesperrt – dann gilt eben der Standard.
    return null;
  }
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Nicht speicherbar ist kein Fehler, den jemand sehen müsste.
  }
}

// --- Systemeinstellung als externe Datenquelle -------------------------------
// Beide Funktionen sind für `useSyncExternalStore` gebaut: Der Browser besitzt
// den Wert, React abonniert ihn. Ein eigener State plus Effekt würde denselben
// Wert nur doppelt halten – und bei jedem Seitenaufruf eine zweite Renderrunde
// auslösen.

export function subscribeToSystemTheme(onChange) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function getSystemDark() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  );
}
