/**
 * Tailwind-Anbindung des Designs.
 *
 * Hier stehen keine Werte, nur Namen: `paper` ist „Fläche einer Karte",
 * `ink` „kräftiger Text". Alle Werte (Farben für Hell und Dunkel, Schriften,
 * Rundungen, Schatten) stehen in src/design.css – dort ändern.
 *
 * Tailwind v4 lädt diese Datei über `@config "../tailwind.config.js"` in
 * src/index.css. Deckkraft-Kurzformen (`bg-surface/60`) funktionieren mit
 * Variablen unverändert – Tailwind setzt daraus ein `color-mix()`.
 */
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
      // Schriften, Schriftgrößen, Abstand und Rundungen stehen als Variablen
      // in src/design.css. Schriftgrößen (`--text-*`) und der Grundabstand
      // (`--spacing`) sind Tailwinds eigene Variablen und werden dort direkt
      // überschrieben.
      fontFamily: {
        // Fließtext
        sans: 'var(--font-body)',
        // Headlines / Navigation / Buttons
        display: 'var(--font-heading)',
      },
      borderRadius: {
        sm: 'var(--radius-small)',
        DEFAULT: 'var(--radius-default)',
        md: 'var(--radius-medium)',
        lg: 'var(--radius-large)',
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
