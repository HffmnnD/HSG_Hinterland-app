import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMs, formatTime } from '../../../lib/format';
import { AXIS, DOT, GRID_PROPS, LINE, SERIES } from './chartTheme';

/**
 * Durchschnittliche Antwortzeit je Minute.
 *
 * Bewusst ein EIGENES Diagramm neben den Anfragen: Millisekunden und Anzahlen
 * sind verschiedene Einheiten. Beides in ein Bild mit zwei Achsen zu zwingen
 * wäre bequem – und der sicherste Weg, dass jemand einen Zusammenhang
 * herausliest, der gar nicht in den Daten steht.
 *
 * Eine einzige Reihe -> keine Legende; die Überschrift sagt bereits, was hier
 * steht.
 *
 * @param {{minute:string, avgMs:number}[]} data
 */
export default function LatencyChart({ data }) {
  return (
    <div className="chart-frame chart-frame--short">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid {...GRID_PROPS} />

          <XAxis dataKey="minute" tickFormatter={formatTime} minTickGap={28} {...AXIS} />
          <YAxis
            width={44}
            tickFormatter={(value) => `${value}`}
            allowDecimals={false}
            {...AXIS}
          />

          <Tooltip content={<LatencyTooltip />} cursor={{ stroke: '#dbe0e4', strokeWidth: 1 }} />

          <Area
            type="monotone"
            dataKey="avgMs"
            name="Antwortzeit"
            stroke={SERIES.latency}
            fill={SERIES.latency}
            fillOpacity={0.1}
            {...LINE}
            dot={false}
            activeDot={{ ...DOT, fill: SERIES.latency }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="font-display font-semibold uppercase tracking-[0.05em] text-ink">
        {formatTime(label)} Uhr
      </p>
      <p className="mt-1 text-ink-muted">
        Ø Antwortzeit{' '}
        <span className="font-bold tabular-nums text-ink">
          {formatMs(payload[0].value)}
        </span>
      </p>
    </div>
  );
}
