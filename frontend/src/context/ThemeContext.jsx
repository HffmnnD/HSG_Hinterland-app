import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { apiFetch } from '../lib/api';
import {
  BAR_COLOR,
  THEMES,
  getSystemDark,
  readStoredTheme,
  storeTheme,
  subscribeToSystemTheme,
} from '../lib/theme';
import { useAuth } from './AuthContext';

/**
 * Globales Thema (Hell / Dunkel) für die gesamte App.
 *
 * ── Wie das Thema technisch wirkt ───────────────────────────────────────────
 * Hier wird ausschliesslich die Klasse `dark` am <html>-Element gesetzt. Alle
 * Farben hängen an CSS-Variablen, die in src/index.css einmal für `:root` und
 * einmal für `.dark` definiert sind; tailwind.config.js verweist mit jedem
 * Farbnamen (`paper`, `ink`, `line`, …) auf diese Variablen. Dadurch gilt der
 * Dunkelmodus für Karten, Tabellen, Dialoge und Navigation, ohne dass an jeder
 * Komponente ein `dark:`-Gegenstück gepflegt werden muss.
 *
 * ── Drei Einstellungen, zwei Darstellungen ──────────────────────────────────
 *   'system' (Standard) – folgt dem Betriebssystem, reagiert live auf Wechsel
 *   'light' / 'dark'    – ausdrückliche Wahl, unabhängig vom Gerät
 *
 * ── Woher die Einstellung kommt ─────────────────────────────────────────────
 * Sie wird NICHT in einen State kopiert, sondern bei jedem Rendern aus drei
 * Quellen abgeleitet – in dieser Reihenfolge:
 *
 *   1. die Wahl, die in dieser Sitzung getroffen wurde (wirkt sofort und
 *      überlebt auch einen fehlgeschlagenen Speichervorgang)
 *   2. das Benutzerprofil (`users.theme`) – die dauerhafte Quelle, damit das
 *      Design am Handy dasselbe ist wie am Rechner
 *   3. die lokale Kopie im `localStorage` – sie deckt den Moment ab, in dem
 *      GET /api/auth/me noch läuft, und den abgemeldeten Zustand
 *
 * Abgeleitet statt kopiert, weil jede Kopie einen Effekt bräuchte, der State
 * aus State setzt – und damit eine zweite Renderrunde bei jedem Seitenaufruf.
 * Das erste Bild zeichnet ohnehin schon das Inline-Skript in index.html
 * richtig; es liest dieselbe lokale Kopie.
 */

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user, refresh } = useAuth();

  // Die Wahl aus DIESER Sitzung. null = es gilt Profil bzw. lokale Kopie.
  const [sessionChoice, setSessionChoice] = useState(null);
  // Lokale Kopie, einmal beim Start gelesen (siehe Kopfkommentar).
  const [storedTheme] = useState(readStoredTheme);

  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemDark,
    // Server-Rendering gibt es hier nicht; der Wert dient nur als Rückfall.
    () => false
  );

  const profileTheme = THEMES.includes(user?.theme) ? user.theme : null;
  const theme = sessionChoice ?? profileTheme ?? storedTheme ?? 'system';
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Die eine Stelle, die das Thema sichtbar macht.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR_COLOR[resolved]);
  }, [resolved]);

  // Profil-Einstellung auch lokal festhalten, damit der nächste Seitenaufruf
  // sofort im richtigen Thema startet (siehe Inline-Skript in index.html).
  useEffect(() => {
    if (profileTheme) storeTheme(profileTheme);
  }, [profileTheme]);

  /**
   * Thema umstellen. Wirkt sofort und wird – wenn jemand angemeldet ist – im
   * Profil gespeichert. Schlägt das Speichern fehl (offline), bleibt die
   * Ansicht trotzdem umgestellt: ein Design ist nichts, wofür man eine
   * Fehlermeldung braucht.
   */
  const setTheme = useCallback(
    async (next) => {
      if (!THEMES.includes(next)) return;

      setSessionChoice(next);
      storeTheme(next);

      if (!user) return;
      try {
        await apiFetch('/api/auth/me/theme', {
          method: 'PATCH',
          body: JSON.stringify({ theme: next }),
        });
        // Profil nachziehen, damit „Mein Konto" denselben Stand zeigt.
        await refresh();
      } catch {
        // Nicht gespeichert – die Wahl dieser Sitzung gilt weiter.
      }
    },
    [user, refresh]
  );

  /** Kurzform für den Umschalter: hell <-> dunkel, ohne den Umweg 'system'. */
  const toggleTheme = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setTheme]
  );

  const value = useMemo(
    () => ({ theme, resolved, isDark: resolved === 'dark', setTheme, toggleTheme }),
    [theme, resolved, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme muss innerhalb von <ThemeProvider> verwendet werden.');
  }
  return context;
}
