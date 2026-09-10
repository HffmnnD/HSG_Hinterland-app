/**
 * Lade-Platzhalter im Vereinslook.
 *
 * Sie nehmen die Form des späteren Inhalts vorweg, damit die Seite beim
 * Eintreffen der Daten nicht springt. Für Vorlesehilfen sind sie unsichtbar
 * (`aria-hidden`) – den Ladezustand meldet stattdessen der umgebende Bereich
 * über `aria-busy`.
 *
 * @param {{ className?: string }} props Höhe/Breite kommen als Tailwind-Klassen
 */
export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Platzhalter für den Kopfbereich der Mannschaftsseite. */
export function HeroSkeleton() {
  return (
    <div className="rounded-md border border-line bg-paper p-5" aria-busy="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-2/3" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

/**
 * Platzhalter für eine Liste oder ein Kartenraster.
 * @param {{ rows?: number, columns?: boolean }} props
 */
export function ListSkeleton({ rows = 4, columns = false }) {
  const items = Array.from({ length: rows }, (_, index) => index);

  return (
    <div
      aria-busy="true"
      className={
        columns
          ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
          : 'divide-y divide-line overflow-hidden rounded-md border border-line bg-paper'
      }
    >
      {items.map((index) =>
        columns ? (
          <div key={index} className="player-card">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ) : (
          <div key={index} className="px-4 py-3.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-2.5 h-4 w-2/3" />
          </div>
        )
      )}
    </div>
  );
}

/** Platzhalter für die Ligatabelle. */
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="card" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9" />
        ))}
      </div>
    </div>
  );
}
