/**
 * App-Kopfzeile: durchgehender grüner Marken-Streifen + weiße, klebende
 * Leiste mit feiner Trennlinie. Inhalt (Marke links, Aktionen rechts) geben
 * die Seiten als `children` vor – die Chrome bleibt überall identisch.
 *
 * @param {string} [width]  Tailwind max-width der Innenspalte (Default max-w-4xl)
 */
export default function AppHeader({ width = 'max-w-4xl', children }) {
  return (
    <>
      <div className="brand-ribbon" />
      <header className="app-header">
        <div className={`app-header__inner w-full ${width}`}>{children}</div>
      </header>
    </>
  );
}
