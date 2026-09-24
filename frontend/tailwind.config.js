/**
 * Corporate Design HSG Hinterland – Licht- und Dunkelmodus
 * --------------------------------------------------------
 * Farben und Typografie sind 1:1 von hsg-hinterland.de übernommen:
 *   - Vereinsgrün  #79b636  (Buttons, Links, aktive Navigation)
 *   - Anthrazit    #2e2e2e  (Kopfzeile, dunkle Flächen, Text)
 *   - Headline     "Oswald" (schmal, kräftig, VERSAL)
 *   - Fließtext    "Lato"
 *
 * ── Warum jede Farbe hier `var(--c-…)` ist ──────────────────────────────────
 * Die Namen in dieser Datei sind BEDEUTUNGEN, keine Farbwerte: `paper` ist
 * „die Fläche, auf der eine Karte liegt", `ink` ist „kräftiger Text". Welcher
 * Farbwert dahinter steckt, entscheidet das Thema – die Werte stehen als
 * CSS-Variablen in src/index.css, einmal für `:root` (hell) und einmal für
 * `.dark` (dunkel).
 *
 * Damit gilt der Dunkelmodus für die GANZE App, ohne dass an tausend Stellen
 * ein `dark:`-Gegenstück gepflegt werden muss: `bg-paper` ist im Hellen weiß
 * und im Dunkeln anthrazit, `text-ink` umgekehrt. `dark:` bleibt für die
 * wenigen Fälle, in denen im Dunkeln etwas ANDERES gilt und nicht nur eine
 * andere Farbe (z. B. schwächere Schatten, andere Verläufe).
 *
 * Tailwind v4 lädt diese Datei über `@config "../tailwind.config.js"` in
 * src/index.css. Deckkraft-Kurzformen (`bg-surface/60`) funktionieren mit
 * Variablen unverändert – Tailwind setzt daraus ein `color-mix()`.
 */
const systemSans =
  '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Der Dunkelmodus hängt an der Klasse `dark` am <html>-Element. Sie setzt
  // der ThemeProvider (src/context/ThemeContext.jsx) – nicht das
  // Betriebssystem allein, denn die Wahl steht im Benutzerprofil.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primärfarbe des Vereins. `DEFAULT` bleibt in beiden Themen das
        // Marken-Grün; `dark`/`darker` sind die Textstufen und drehen sich im
        // Dunkelmodus ins Hellere (dunkles Grün auf dunklem Grund ist nicht
        // lesbar).
        'hsg-green': {
          DEFAULT: 'var(--c-green)',
          dark: 'var(--c-green-dark)', // Hover / aktiver Zustand, Text
          darker: 'var(--c-green-darker)', // gedrückt
          soft: 'var(--c-green-soft)', // getönte Fläche (Hinweise, Erfolg)
          line: 'var(--c-green-line)', // getönte Kontur
        },
        // Anthrazit – Kopfzeile, sekundäre Buttons, Text
        'hsg-dark': {
          DEFAULT: 'var(--c-dark)',
          hover: 'var(--c-dark-hover)',
          soft: 'var(--c-dark-soft)',
        },
        // Text
        ink: {
          DEFAULT: 'var(--c-ink)', // Überschriften / kräftiger Text
          soft: 'var(--c-ink-soft)', // Fließtext
          muted: 'var(--c-ink-muted)', // Sekundärtext, Tabellenköpfe
        },
        // Flächen & Linien (feine Kontrast-Nuancen)
        paper: 'var(--c-paper)',
        surface: {
          DEFAULT: 'var(--c-surface)', // Seitenhintergrund, Tabellenkopf
          strong: 'var(--c-surface-strong)', // Zeilen-Hover
        },
        line: {
          DEFAULT: 'var(--c-line)', // feine Trennlinien
          strong: 'var(--c-line-strong)', // kräftigere Kontur (Inputs)
        },
        // Statusfarben
        warn: {
          DEFAULT: 'var(--c-warn)',
          soft: 'var(--c-warn-soft)',
          line: 'var(--c-warn-line)',
        },
        danger: {
          DEFAULT: 'var(--c-danger)', // Textfarbe – im Dunkeln heller
          fill: 'var(--c-danger-fill)', // volle Fläche mit weißer Schrift
          soft: 'var(--c-danger-soft)',
          line: 'var(--c-danger-line)',
        },
      },
      fontFamily: {
        // Fließtext
        sans: ['"Lato"', systemSans],
        // Headlines / Navigation / Buttons – schmale Groteske, VERSAL
        display: ['"Oswald"', systemSans],
      },
      fontSize: {
        // etwas kompakter – „sportlich", wie auf der Vereinsseite
        base: ['0.9375rem', { lineHeight: '1.6' }],
      },
      borderRadius: {
        // milde, klare Kanten – nichts „aufgeblasenes"
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        // Schatten sind im Dunkeln fast unsichtbar und wirken schmutzig –
        // deshalb hängen auch sie an Variablen (siehe index.css).
        card: 'var(--shadow-card)',
        header: '0 1px 0 var(--c-line)',
        pop: 'var(--shadow-pop)',
      },
      ringColor: {
        DEFAULT: 'var(--c-green)',
      },
    },
  },
  plugins: [],
};
