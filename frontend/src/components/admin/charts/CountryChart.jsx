import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatNumber, formatPercent } from '../../../lib/format';
import { AXIS, GRID, SERIES } from './chartTheme';

// Mehr Zeilen als diese passen nicht mehr lesbar in eine Karte; der Rest wird
// zu „Übrige Länder" zusammengefasst, statt das Diagramm zu strecken.
const MAX_ROWS = 8;

/**
 * Anfragen nach Herkunftsland – waagerechte Balken.
 *
 * Waagerecht, weil Ländernamen lang sind („Vereinigtes Königreich"): an einer
 * senkrechten Achse stünden sie schräg oder abgeschnitten.
 *
 * EINE Farbe für alle Balken. Die Länder sind keine Reihen, die man
 * auseinanderhalten muss – ihre Größe steht schon in der Balkenlänge. Sie
 * unterschiedlich einzufärben würde den Farbkanal für etwas verbrauchen, das
 * die Länge bereits sagt.
 *
 * @param {{code:string, label:string, requests:number, share:number}[]} countries
 */
export default function CountryChart({ countries }) {
  const rows = prepareRows(countries);
  // Höhe mitwachsen lassen: 8 Balken in 260px wären Striche.
  const height = Math.max(140, rows.length * 34 + 28);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke={GRID} strokeWidth={1} horizontal={false} />

          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            {...AXIS}
            axisLine={false}
            // Lange Namen kürzen statt umbrechen – der Tooltip zeigt den
            // vollen Namen.
            tickFormatter={(value) => (value.length > 16 ? `${value.slice(0, 15)}…` : value)}
          />

          <Tooltip content={<CountryTooltip />} cursor={{ fill: '#f8f9fa' }} />

          <Bar
            dataKey="requests"
            name="Anfragen"
            fill={SERIES.requests}
            // 4px abgerundetes Datenende, eckig an der Grundlinie.
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell key={row.code} fill={SERIES.requests} />
            ))}
            {/* Wert am Balkenende – die Achse trägt hier keine Zahlen. */}
            <LabelList
              dataKey="requests"
              position="right"
              formatter={formatNumber}
              style={{ fill: '#4b4b4b', fontSize: 11, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Auf MAX_ROWS kürzen und den Rest zusammenfassen. Ohne diesen Schritt
 * wächst die Karte mit jedem exotischen Land, das einmal vorbeischaut.
 */
function prepareRows(countries) {
  if (countries.length <= MAX_ROWS) return countries;

  const head = countries.slice(0, MAX_ROWS - 1);
  const tail = countries.slice(MAX_ROWS - 1);

  return [
    ...head,
    {
      code: '__rest',
      label: `Übrige (${tail.length})`,
      requests: tail.reduce((sum, row) => sum + row.requests, 0),
      share: tail.reduce((sum, row) => sum + row.share, 0),
    },
  ];
}

function CountryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <p className="font-display font-semibold uppercase tracking-[0.05em] text-ink">
        {row.label}
      </p>
      <p className="mt-1 text-ink-muted">
        <span className="font-bold tabular-nums text-ink">
          {formatNumber(row.requests)}
        </span>{' '}
        Anfragen · {formatPercent(row.share)}
      </p>
    </div>
  );
}
