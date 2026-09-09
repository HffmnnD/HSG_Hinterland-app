import AppLayout from './AppLayout';

/**
 * Platzhalter für das kommende Termin-Modul (`/termine`).
 *
 * Bewusst OHNE Beispiel-Spieldaten: erfundene Begegnungen oder Ergebnisse
 * könnten für echte gehalten werden. Stattdessen wird transparent gezeigt,
 * was das Modul enthalten wird.
 */
const PLANNED_FEATURES = [
  {
    title: 'Spielplan',
    description:
      'Alle Begegnungen deiner Mannschaften mit Anwurfzeit, Halle und Gegner – automatisch nach deinen Zuordnungen gefiltert.',
  },
  {
    title: 'Trainingszeiten',
    description:
      'Wiederkehrende Trainingstermine je Mannschaft, inklusive kurzfristiger Ausfälle und Hallenwechsel.',
  },
  {
    title: 'Helferdienste',
    description:
      'Einteilung für Zeitnehmertisch und Verkaufsdienst – mit Erinnerung an den eigenen Einsatz.',
  },
];

export default function SchedulePage() {
  return (
    <AppLayout width="max-w-3xl">
      <h1 className="page-title">Spielplan &amp; Termine</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Der Terminbereich der Vereins-App.
      </p>

      <div className="card-accent mt-6">
        <p className="eyebrow">In Vorbereitung</p>
        <h2 className="section-title mt-1.5 text-base">
          Dieses Modul entsteht gerade
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Spielplan, Trainingszeiten und die Dienstplanung ziehen als Nächstes
          in die App ein. Bis dahin findest du alle Termine wie gewohnt auf der
          Vereinsseite und im Aushang der Halle.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="section-title">Was hier entstehen wird</h2>
        <ul className="mt-3 space-y-3">
          {PLANNED_FEATURES.map((feature) => (
            <li key={feature.title} className="card">
              <h3 className="font-display text-sm font-bold uppercase tracking-[0.04em] text-ink">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-sm text-ink-soft">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </AppLayout>
  );
}
