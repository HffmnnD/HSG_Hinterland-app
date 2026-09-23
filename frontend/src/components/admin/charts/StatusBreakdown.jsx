import { formatNumber, formatPercent } from '../../../lib/format';
import { STATUS, STATUS_LABELS } from './chartTheme';

// Reihenfolge von „gut" nach „kritisch" – nicht nach Häufigkeit. So steht die
// Zeile, die man sucht (5xx), immer an derselben Stelle.
const ORDER = ['2xx', '3xx', '4xx', '5xx', 'other'];

/**
 * Verteilung der HTTP-Statusklassen.
 *
 * Bewusst KEIN Torten- oder Stapeldiagramm, aus zwei Gründen:
 *
 *   1. Bernstein (4xx) und Rot (5xx) liegen im Farbabstand zu dicht
 *      beieinander, um sie direkt aneinandergrenzen zu lassen – bei einer
 *      Rot-Grün-Sehschwäche wären zwei angrenzende Segmente nicht sicher
 *      auseinanderzuhalten. Als getrennte Zeilen mit Beschriftung stellt sich
 *      die Frage gar nicht erst.
 *   2. Der interessante Wert ist fast immer der kleinste (Serverfehler). In
 *      einem Tortendiagramm ist genau der ein unleserlicher Splitter.
 *
 * Jede Zeile trägt Punkt, Klartext, absolute Zahl UND Anteil – die Farbe ist
 * reine Zugabe.
 *
 * @param {{klass:string, count:number, share:number}[]} statusClasses
 */
export default function StatusBreakdown({ statusClasses }) {
  const rows = ORDER.map((klass) => statusClasses.find((row) => row.klass === klass)).filter(
    Boolean
  );

  if (rows.length === 0) {
    return (
      <p className="py-4 text-sm text-ink-muted">
        Noch keine Anfragen im Beobachtungsfenster.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.klass}>
          <div className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS[row.klass] ?? STATUS.other }}
            />
            <span className="font-semibold text-ink">
              {STATUS_LABELS[row.klass] ?? row.klass}
            </span>
            <span className="ml-auto tabular-nums text-ink-muted">
              {formatNumber(row.count)}
            </span>
            <span className="w-14 shrink-0 text-right font-bold tabular-nums text-ink">
              {formatPercent(row.share)}
            </span>
          </div>

          <div className="meter mt-1.5">
            <span
              className="meter__fill"
              style={{
                width: `${Math.min(100, row.share)}%`,
                backgroundColor: STATUS[row.klass] ?? STATUS.other,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
