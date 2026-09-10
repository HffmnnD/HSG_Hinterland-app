import { Badge } from '../Badge';
import { useHandballTable } from '../../hooks/useHandball';
import {
  describeSource,
  formatGoalDifference,
  formatNumber,
  formatPoints,
} from '../../lib/handball';

/**
 * Ligatabelle der Mannschaft (Daten aus nuLiga/HHV, serverseitig gecacht).
 *
 * Die Spalten sind nach Wichtigkeit gestaffelt, damit auf dem Handy die
 * entscheidende Punktzahl sichtbar bleibt statt am rechten Rand zu
 * verschwinden:
 *   immer  Rang · Mannschaft · Spiele · Punkte
 *   ab sm  + Siege/Unentschieden/Niederlagen · Tordifferenz
 *   ab md  + Tore
 * Zusätzlich scrollt die Tabelle horizontal (`.table-wrap`) – auch sehr lange
 * Vereinsnamen brechen das Layout damit nicht.
 *
 * @param {{ teamId: string,
 *           title?: string,
 *           highlightTeamId?: string,
 *           limit?: number }} props
 *   `highlightTeamId` markiert die eigene Mannschaft (Standard: `teamId`).
 *   `limit` zeigt nur die ersten n Zeilen – für das Dashboard-Widget.
 */
export default function TableWidget({
  teamId,
  title = 'Tabelle',
  highlightTeamId,
  limit,
}) {
  const { table, rows, meta, loading, error } = useHandballTable(teamId);

  const ownTeamId = highlightTeamId ?? teamId;
  const visibleRows = limit ? rows.slice(0, limit) : rows;
  const sourceNote = describeSource(meta);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {table?.competition && (
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {table.competition}
              {table.season ? ` · ${table.season}` : ''}
            </p>
          )}
        </div>
        {meta?.stale && <Badge variant="pending">Nicht aktuell</Badge>}
      </div>

      {error && (
        <div role="alert" className="alert alert-error mt-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Tabelle wird geladen …</p>
      ) : visibleRows.length === 0 ? (
        <p className="card-note mt-4">
          {meta?.available === false
            ? 'Die Tabelle kann gerade nicht vom Verband geladen werden.'
            : 'Für diese Mannschaft liegt noch keine Tabelle vor.'}
        </p>
      ) : (
        <div className="table-wrap mt-4">
          <table className="data-table data-table-compact">
            <caption className="sr-only">
              {`Ligatabelle${table?.competition ? ` – ${table.competition}` : ''}`}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-right">
                  #
                </th>
                <th scope="col">Mannschaft</th>
                <th scope="col" className="text-right">
                  Sp
                </th>
                {/* S/U/N brauchen Platz – erst ab Tablet einblenden. */}
                <th scope="col" className="hidden text-right sm:table-cell">
                  S
                </th>
                <th scope="col" className="hidden text-right sm:table-cell">
                  U
                </th>
                <th scope="col" className="hidden text-right sm:table-cell">
                  N
                </th>
                <th scope="col" className="hidden text-right md:table-cell">
                  Tore
                </th>
                <th scope="col" className="hidden text-right sm:table-cell">
                  Diff
                </th>
                <th scope="col" className="text-right">
                  Punkte
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isOwn =
                  ownTeamId && row.teamId
                    ? String(row.teamId) === String(ownTeamId)
                    : false;

                return (
                  <tr
                    key={row.teamId ?? `${row.rank}-${row.teamName}`}
                    className={isOwn ? 'row-own' : undefined}
                  >
                    <td className="text-right tabular-nums">{row.rank}</td>
                    <th scope="row" className="font-normal">
                      <span className="flex items-center gap-2">
                        {row.teamLogoUrl && (
                          <img
                            src={row.teamLogoUrl}
                            alt=""
                            loading="lazy"
                            className="h-5 w-5 shrink-0 object-contain"
                          />
                        )}
                        <span className="max-w-[10.5rem] truncate sm:max-w-none">
                          {row.teamName ?? '—'}
                        </span>
                        {/* Für Screenreader: die Farbmarkierung allein
                            transportiert die Information nicht. */}
                        {isOwn && <span className="sr-only">(eigene Mannschaft)</span>}
                      </span>
                    </th>
                    <td className="text-right tabular-nums">
                      {formatNumber(row.games)}
                    </td>
                    <td className="hidden text-right tabular-nums sm:table-cell">
                      {formatNumber(row.wins)}
                    </td>
                    <td className="hidden text-right tabular-nums sm:table-cell">
                      {formatNumber(row.draws)}
                    </td>
                    <td className="hidden text-right tabular-nums sm:table-cell">
                      {formatNumber(row.losses)}
                    </td>
                    <td className="hidden whitespace-nowrap text-right tabular-nums md:table-cell">
                      {row.goalsFor === null || row.goalsAgainst === null
                        ? '—'
                        : `${row.goalsFor}:${row.goalsAgainst}`}
                    </td>
                    <td className="hidden text-right tabular-nums sm:table-cell">
                      {formatGoalDifference(row.goalDifference)}
                    </td>
                    <td className="whitespace-nowrap text-right font-bold tabular-nums">
                      {formatPoints(row.points, row.pointsAgainst)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sourceNote && <p className="field-hint mt-3">{sourceNote}</p>}
    </section>
  );
}
