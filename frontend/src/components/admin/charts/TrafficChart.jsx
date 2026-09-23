import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatNumber, formatTime } from '../../../lib/format';
import { AXIS, DOT, GRID_PROPS, LINE, SERIES } from './chartTheme';

/**
 * Anfragen und Fehler je Minute im Beobachtungsfenster.
 *
 * Beide Reihen zählen dasselbe (Anfragen), teilen sich also EINE Achse. Zwei
 * Achsen mit unterschiedlichen Maßstäben wären hier der klassische Fehler:
 * sie lassen jede Fehlerspitze aussehen wie ein Zusammenbruch, egal wie klein
 * sie tatsächlich ist.
 *
 * Die Anfragen liegen als Fläche darunter (Kontext), die Fehler als kräftige
 * Linie darüber (die Reihe, um die es geht).
 *
 * @param {{minute:string, requests:number, errors:number}[]} data
 */
export default function TrafficChart({ data }) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid {...GRID_PROPS} />

          <XAxis
            dataKey="minute"
            tickFormatter={formatTime}
            // Bei 60 Minuten würde jede Beschriftung die nächste überlappen –
            // Recharts blendet dann selbst welche aus.
            minTickGap={28}
            {...AXIS}
          />
          <YAxis allowDecimals={false} width={44} {...AXIS} />

          <Tooltip content={<TrafficTooltip />} cursor={{ stroke: '#dbe0e4', strokeWidth: 1 }} />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="plainline"
            iconSize={14}
            wrapperStyle={{ fontSize: 12, color: '#4b4b4b' }}
          />

          <Area
            type="monotone"
            dataKey="requests"
            name="Anfragen"
            stroke={SERIES.requests}
            fill={SERIES.requests}
            fillOpacity={0.1}
            {...LINE}
            dot={false}
            activeDot={{ ...DOT, fill: SERIES.requests }}
          />
          <Line
            type="monotone"
            dataKey="errors"
            name="Fehler (4xx/5xx)"
            stroke={SERIES.errors}
            {...LINE}
            dot={false}
            activeDot={{ ...DOT, fill: SERIES.errors }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Eigener Tooltip statt des Recharts-Standards: dieselbe Kartensprache wie
 * der Rest der App, deutsche Zahlen und die Uhrzeit als Überschrift.
 */
function TrafficTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="font-display font-semibold uppercase tracking-[0.05em] text-ink">
        {formatTime(label)} Uhr
      </p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-ink-muted">{entry.name}</span>
            <span className="ml-auto font-bold tabular-nums text-ink">
              {formatNumber(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
