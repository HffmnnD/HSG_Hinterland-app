/**
 * Corporate Design HSG Hinterland
 * ---------------------------------
 * Farben und Typografie sind 1:1 von hsg-hinterland.de übernommen:
 *   - Vereinsgrün  #79b636  (Buttons, Links, aktive Navigation)
 *   - Anthrazit    #2e2e2e  (Kopfzeile, dunkle Flächen, Text)
 *   - Flächen      #ffffff / #f8f9fa / #e9ecef
 *   - Headline     "Oswald" (schmal, kräftig, VERSAL)
 *   - Fließtext    "Lato"
 *
 * Tailwind v4 lädt diese Datei über `@config "../tailwind.config.js"` in
 * src/index.css. Alle Werte stehen zusätzlich als CSS-Variablen bereit
 * (z. B. `var(--color-hsg-green)`), die das Komponenten-Layer nutzt.
 */
const systemSans =
  '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primärfarbe des Vereins
        'hsg-green': {
          DEFAULT: '#79b636',
          dark: '#5f9e28', // Hover / aktiver Zustand
          darker: '#4c7f1f', // gedrückt
          soft: '#eef6e4', // getönte Fläche (Hinweise, Erfolg)
          line: '#cfe4b4', // getönte Kontur
        },
        // Anthrazit – Kopfzeile, sekundäre Buttons, Text
        'hsg-dark': {
          DEFAULT: '#2e2e2e',
          hover: '#1f1f1f',
          soft: '#3d3d3d',
        },
        // Text
        ink: {
          DEFAULT: '#2e2e2e', // Überschriften / kräftiger Text
          soft: '#4b4b4b', // Fließtext
          muted: '#727579', // Sekundärtext, Tabellenköpfe
        },
        // Flächen & Linien (feine Kontrast-Nuancen)
        paper: '#ffffff',
        surface: {
          DEFAULT: '#f8f9fa', // Karten-/Tabellen-Hintergrund
          strong: '#eef1f3', // Zeilen-Hover
        },
        line: {
          DEFAULT: '#e9ecef', // feine Trennlinien
          strong: '#dbe0e4', // kräftigere Kontur (Inputs)
        },
        // Statusfarben
        warn: {
          DEFAULT: '#8a6116',
          soft: '#fdf6e7',
          line: '#f0d9a8',
        },
        danger: {
          DEFAULT: '#c0392b',
          soft: '#fdecea',
          line: '#f2c4bf',
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
        card: '0 1px 2px rgb(20 24 28 / 0.05), 0 1px 3px rgb(20 24 28 / 0.08)',
        header: '0 1px 0 #e9ecef',
        pop: '0 8px 24px rgb(20 24 28 / 0.12)',
      },
      ringColor: {
        DEFAULT: '#79b636',
      },
    },
  },
  plugins: [],
};
