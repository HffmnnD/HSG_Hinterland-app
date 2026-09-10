import { formatPercent } from '../../../lib/format';

/**
 * Kennzahl-Karte: Beschriftung, Wert und wahlweise ein Balken (Messer).
 *
 * Warum hier ein Balken und kein Diagramm: ein einzelner Anteil an einem
 * Maximum (RAM, CPU, Plattenplatz) ist keine Datenreihe. Ein Tortendiagramm
 * mit zwei Stücken oder ein Balkendiagramm mit einem Balken sagt exakt
 * dasselbe wie ein Messer – nur mit zehnmal so viel Fläche.
 *
 * @param {React.ComponentType} [icon]     lucide-Icon
 * @param {string}  label
 * @param {React.ReactNode} value          Hauptwert (bereits formatiert)
 * @param {string}  [hint]                 Kleingedrucktes darunter
 * @param {number}  [percent]              0–100; blendet den Balken ein
 * @param {'auto'|'neutral'|'good'} [tone] Färbung des Balkens
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  percent,
  tone = 'auto',
  children,
}) {
  const showMeter = typeof percent === 'number' && Number.isFinite(percent);
  const clamped = showMeter ? Math.min(100, Math.max(0, percent)) : 0;

  return (
    <div className="stat-card">
      <p className="stat-card__label">
        {Icon && <Icon size={14} aria-hidden="true" className="shrink-0" />}
        {label}
      </p>

      <p className="stat-value">{value}</p>

      {showMeter && (
        <>
          <div
            className="meter"
            role="meter"
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${formatPercent(clamped)}`}
          >
            <span
              className="meter__fill"
              style={{ width: `${clamped}%`, backgroundColor: meterColor(clamped, tone) }}
            />
          </div>
          {/* Der Zahlenwert steht IMMER als Text daneben – die Farbe des
              Balkens ist Zusatzinformation, nie die einzige. */}
          <p className="mt-1.5 text-xs text-ink-muted">
            {hint ?? `${formatPercent(clamped)} belegt`}
          </p>
        </>
      )}

      {!showMeter && hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}

      {children}
    </div>
  );
}

/**
 * Farbe des Balkens. `auto` schaltet ab 75 % auf Bernstein und ab 90 % auf
 * Rot – die reservierten Statusfarben der App. Darunter das Vereinsgrün.
 */
function meterColor(percent, tone) {
  if (tone === 'neutral') return '#727579';
  if (tone === 'good') return '#5f9e28';
  if (percent >= 90) return '#c0392b';
  if (percent >= 75) return '#8a6116';
  return '#5f9e28';
}
