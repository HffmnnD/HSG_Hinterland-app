import { useState } from 'react';

import { useAttendanceHistory } from '../../hooks/useSchedule';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  buildCsv,
  downloadCsv,
  eventTypeLabel,
  formatClock,
  formatEventDay,
  formatIsoDate,
  formatIsoRange,
  shiftIsoDate,
  statusPresentation,
  toDateInput,
} from '../../lib/schedule';

/** Saisonbeginn im Handball: 1. Juli. Vor Juli zählt die laufende Saison. */
function seasonStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

const QUICK_RANGES = [
  { key: '30', label: 'Letzte 30 Tage', from: () => shiftIsoDate(toDateInput(), -30) },
  { key: '90', label: 'Letzte 90 Tage', from: () => shiftIsoDate(toDateInput(), -90) },
  { key: 'season', label: 'Laufende Saison', from: seasonStart },
  { key: '365', label: 'Letzte 12 Monate', from: () => shiftIsoDate(toDateInput(), -365) },
];

/** Farbe der Beteiligungsquote – ab 75 % grün, ab 50 % gelb, darunter rot. */
function rateTone(rate) {
  if (rate === null) return 'text-ink-muted';
  if (rate >= 75) return 'text-hsg-green-darker';
  if (rate >= 50) return 'text-warn';
  return 'text-danger';
}

/**
 * Historie und Trainingsbeteiligung.
 *
 * Beantwortet beide Fragen aus dem Alltag:
 *   „War Person X am 01.01.2026 beim Training?"  – Einzelansicht
 *   „Wer ist wie oft da?"                        – Kaderübersicht (Trainer)
 *
 * @param {{ teams: object[], defaultTeamId?: number|null }} props
 */
export default function HistoryPanel({ teams, defaultTeamId = null }) {
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? null);
  const [from, setFrom] = useState(seasonStart());
  const [to, setTo] = useState(toDateInput());
  const [type, setType] = useState('');
  const [focusUserId, setFocusUserId] = useState(null);

  const { history, loading, error } = useAttendanceHistory({
    teamId,
    userId: focusUserId,
    from,
    to,
    type: type || null,
  });

  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const canManage = history?.canManage ?? false;

  const applyQuickRange = (range) => {
    setFrom(range.from());
    setTo(toDateInput());
  };

  const exportRoster = () => {
    if (!history?.players?.length) return;
    const csv = buildCsv(
      ['Nachname', 'Vorname', 'Nummer', 'Termine', 'Zugesagt', 'Abgesagt', 'Quote %'],
      history.players.map((player) => [
        player.lastName,
        player.firstName,
        player.jerseyNumber,
        player.total,
        player.attending,
        player.declined,
        player.rate,
      ])
    );
    downloadCsv(
      `beteiligung_${team?.code ?? 'team'}_${from}_${to}.csv`,
      csv
    );
  };

  const exportEntries = () => {
    if (!history?.entries?.length) return;
    const csv = buildCsv(
      ['Datum', 'Beginn', 'Ende', 'Titel', 'Art', 'Ort', 'Status', 'Grund'],
      history.entries.map((entry) => [
        formatIsoDate(entry.startTime.slice(0, 10)),
        formatClock(entry.startTime),
        formatClock(entry.endTime),
        entry.title,
        eventTypeLabel(entry.type),
        entry.location,
        entry.status === 'DECLINED' ? 'Nicht da' : 'Da',
        entry.reason ?? '',
      ])
    );
    const who = history.user
      ? `${history.user.lastName ?? ''}_${history.user.firstName ?? ''}`
      : 'eigene';
    downloadCsv(`historie_${who}_${from}_${to}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- Filter */}
      <section className="card">
        <p className="eyebrow">Zeitraum &amp; Mannschaft</p>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {teams.length > 1 && (
            <div>
              <label className="field-label" htmlFor="history-team">
                Mannschaft
              </label>
              <select
                id="history-team"
                value={teamId ?? ''}
                onChange={(event) => {
                  setTeamId(Number(event.target.value));
                  setFocusUserId(null);
                }}
                className="field-control"
              >
                {teams.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="history-from">
              Von
            </label>
            <input
              id="history-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="field-control"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="history-to">
              Bis
            </label>
            <input
              id="history-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="field-control"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              onClick={() => applyQuickRange(range)}
              className={`chip chip-sm ${from === range.from() ? 'chip-active' : ''}`}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setType('')}
            aria-pressed={type === ''}
            className={`chip chip-sm ${type === '' ? 'chip-active' : ''}`}
          >
            Alle Termine
          </button>
          {EVENT_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={`chip chip-sm ${type === value ? 'chip-active' : ''}`}
            >
              nur {EVENT_TYPE_LABELS[value]}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          <span className="skeleton h-10 w-full" />
          <span className="skeleton h-40 w-full" />
        </div>
      )}

      {!loading && history && (
        <>
          <p className="text-sm text-ink-muted">
            {formatIsoRange(history.range.from, history.range.to)} ·{' '}
            {history.totalEvents} Termine, davon {history.countedEvents}{' '}
            bereits stattgefunden
            {history.type ? ` · gefiltert: ${eventTypeLabel(history.type)}` : ''}
          </p>

          {/* ------------------------------------------- Kaderübersicht */}
          {canManage && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">Trainingsbeteiligung</h2>
                <button
                  type="button"
                  onClick={exportRoster}
                  disabled={!history.players.length}
                  className="btn btn-outline btn-sm"
                >
                  Als CSV exportieren
                </button>
              </div>

              {history.players.length === 0 ? (
                <p className="card-note mt-3">
                  In diesem Zeitraum hat noch kein Termin stattgefunden.
                </p>
              ) : (
                <div className="table-wrap mt-3">
                  <table className="data-table data-table-compact">
                    <thead>
                      <tr>
                        <th scope="col">Spieler:in</th>
                        <th scope="col">Termine</th>
                        <th scope="col">Da</th>
                        <th scope="col">Fehlt</th>
                        <th scope="col">Quote</th>
                        <th scope="col">
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.players.map((player) => (
                        <tr
                          key={player.userId}
                          className={
                            player.userId === focusUserId ? 'row-own' : ''
                          }
                        >
                          <th scope="row" className="font-normal">
                            {player.jerseyNumber != null && (
                              <span className="mr-1.5 font-display font-bold text-ink-muted">
                                {player.jerseyNumber}
                              </span>
                            )}
                            {player.lastName}, {player.firstName}
                          </th>
                          <td>{player.total}</td>
                          <td>{player.attending}</td>
                          <td>{player.declined}</td>
                          <td className={`font-bold ${rateTone(player.rate)}`}>
                            {player.rate === null ? '—' : `${player.rate} %`}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                setFocusUserId(
                                  focusUserId === player.userId
                                    ? null
                                    : player.userId
                                )
                              }
                              className="link text-xs"
                            >
                              {focusUserId === player.userId
                                ? 'schließen'
                                : 'Termine'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* --------------------------------------- Termine einer Person */}
          {history.entries && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">
                  {history.user?.lastName
                    ? `${history.user.firstName} ${history.user.lastName}`
                    : 'Meine Termine'}
                </h2>
                <button
                  type="button"
                  onClick={exportEntries}
                  disabled={!history.entries.length}
                  className="btn btn-outline btn-sm"
                >
                  Als CSV exportieren
                </button>
              </div>

              {history.user && (
                <p className="mt-1 text-sm text-ink-soft">
                  {history.user.attending} von {history.user.total} bereits
                  stattgefundenen Terminen dabei
                  {history.user.rate !== null && (
                    <span className={`font-bold ${rateTone(history.user.rate)}`}>
                      {' '}
                      ({history.user.rate} %)
                    </span>
                  )}
                </p>
              )}

              {history.entries.length === 0 ? (
                <p className="card-note mt-3">
                  In diesem Zeitraum gibt es keine Termine.
                </p>
              ) : (
                <ul className="list-panel mt-3">
                  {history.entries.map((entry) => {
                    const view = statusPresentation(entry.status, entry.source);
                    return (
                      <li
                        key={entry.eventId}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-semibold text-ink">
                            {formatEventDay(entry.startTime)}
                          </span>
                          <span className="text-sm text-ink-soft">
                            {formatClock(entry.startTime)} Uhr ·{' '}
                            {entry.title}
                            {entry.location ? ` · ${entry.location}` : ''}
                            {!entry.isPast && (
                              <span className="text-ink-muted">
                                {' '}
                                · steht noch bevor
                              </span>
                            )}
                          </span>
                        </span>

                        <span className="flex flex-wrap items-center gap-2">
                          {entry.reason && (
                            <span className="text-sm text-ink-soft">
                              {entry.reason}
                            </span>
                          )}
                          {entry.reasonHidden && (
                            <span className="text-xs text-ink-muted">
                              Grund verborgen
                            </span>
                          )}
                          <span className={`badge ${view.badge}`}>
                            {view.label}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {canManage && !history.entries && (
            <p className="field-hint">
              Für die Termin-für-Termin-Ansicht eine:n Spieler:in in der
              Tabelle auswählen.
            </p>
          )}
        </>
      )}
    </div>
  );
}
