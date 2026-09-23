import { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import { useAttendanceHistory } from '../../hooks/useSchedule';
import {
  EVENT_CATEGORIES,
  formatClock,
  formatEventDay,
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
  { key: '30', label: '30 Tage', from: () => shiftIsoDate(toDateInput(), -30) },
  { key: '90', label: '90 Tage', from: () => shiftIsoDate(toDateInput(), -90) },
  { key: 'season', label: 'Saison', from: seasonStart },
];

/** Ab 75 % grün, ab 50 % gelb, darunter rot. */
function rateTone(rate) {
  if (rate === null) return 'text-ink-muted';
  if (rate >= 75) return 'text-hsg-green-darker';
  if (rate >= 50) return 'text-warn';
  return 'text-danger';
}

function barTone(rate) {
  if (rate >= 75) return 'bg-hsg-green';
  if (rate >= 50) return 'bg-warn';
  return 'bg-danger';
}

/**
 * Trainingsbeteiligung: Wer war in einem Zeitraum zu wie viel Prozent da?
 *
 * Für ALLE in der Mannschaft sichtbar, nicht nur für das Trainerteam – wer
 * regelmäßig kommt, darf sehen, wer das auch tut. Geschützt bleibt allein der
 * GRUND einer Absage: Den filtert das Backend nach der Einstellung des
 * jeweiligen Termins.
 *
 * Gezählt werden nur Termine, die bereits stattgefunden haben und nicht
 * abgesagt wurden. Ein Training in drei Wochen ist noch keine Teilnahme, und
 * eine ausgefallene Einheit soll niemandes Quote drücken.
 *
 * @param {{ teams: object[], defaultTeamId?: number|null }} props
 */
export default function ParticipationPanel({ teams, defaultTeamId = null }) {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? null);
  const [from, setFrom] = useState(seasonStart());
  const [to, setTo] = useState(toDateInput());
  const [category, setCategory] = useState('');
  const [openUserId, setOpenUserId] = useState(null);

  const { history, loading, error } = useAttendanceHistory({
    teamId,
    userId: openUserId,
    from,
    to,
    category: category || null,
  });

  const players = history?.players ?? [];

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- Filter */}
      <section className="card">
        <div className="grid gap-4 sm:grid-cols-3">
          {teams.length > 1 && (
            <div>
              <label className="field-label" htmlFor="part-team">
                Mannschaft
              </label>
              <select
                id="part-team"
                value={teamId ?? ''}
                onChange={(event) => {
                  setTeamId(Number(event.target.value));
                  setOpenUserId(null);
                }}
                className="field-control"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="part-from">
              Von
            </label>
            <input
              id="part-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="field-control"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="part-to">
              Bis
            </label>
            <input
              id="part-to"
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
              onClick={() => {
                setFrom(range.from());
                setTo(toDateInput());
              }}
              aria-pressed={from === range.from()}
              className={`chip chip-sm ${from === range.from() ? 'chip-active' : ''}`}
            >
              {range.label}
            </button>
          ))}

          <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />

          <button
            type="button"
            onClick={() => setCategory('')}
            aria-pressed={category === ''}
            className={`chip chip-sm ${category === '' ? 'chip-active' : ''}`}
          >
            Alles
          </button>
          {EVENT_CATEGORIES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setCategory(entry.key)}
              aria-pressed={category === entry.key}
              className={`chip chip-sm ${category === entry.key ? 'chip-active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}

      {loading && <span className="skeleton h-48 w-full" />}

      {!loading && history && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">Beteiligung</h2>
            <span className="text-sm text-ink-muted">
              {formatIsoRange(history.range.from, history.range.to)} ·{' '}
              {history.countedEvents} Termine
            </span>
          </div>

          {players.length === 0 ? (
            <p className="card-note mt-3">
              In diesem Zeitraum hat kein Termin stattgefunden.
            </p>
          ) : (
            <ul className="list-panel mt-3">
              {players.map((player) => {
                const isMe = player.userId === user?.id;
                return (
                  <li key={player.userId}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenUserId(
                          openUserId === player.userId ? null : player.userId
                        )
                      }
                      aria-expanded={openUserId === player.userId}
                      className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface ${
                        isMe ? 'bg-hsg-green-soft' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {player.firstName} {player.lastName}
                          {isMe && (
                            <span className="ml-1 text-xs font-normal text-ink-muted">
                              (du)
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
                          <span
                            className={`block h-full rounded-full ${barTone(player.rate)}`}
                            style={{ width: `${player.rate ?? 0}%` }}
                          />
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        <span
                          className={`block font-display text-lg font-bold leading-none ${rateTone(player.rate)}`}
                        >
                          {player.rate === null ? '—' : `${player.rate} %`}
                        </span>
                        <span className="mt-1 block text-xs text-ink-muted">
                          {player.attending} von {player.total}
                        </span>
                      </span>
                    </button>

                    {openUserId === player.userId && (
                      <EntryList entries={history.entries} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Termin-für-Termin-Liste einer Person.
 *
 * Beantwortet die Frage, für die das Modul die Daten dauerhaft speichert:
 * „War Person X am 01.01.2026 beim Training?"
 */
function EntryList({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-ink-muted">
        Keine Termine in diesem Zeitraum.
      </p>
    );
  }

  return (
    <ul className="border-t border-line bg-surface/60 px-4 py-2">
      {entries.map((entry) => {
        const view = statusPresentation(entry.status, entry.source);
        return (
          <li
            key={entry.eventId}
            className="flex flex-wrap items-center justify-between gap-2 py-1.5"
          >
            <span className="text-sm text-ink-soft">
              {formatEventDay(entry.startTime)}, {formatClock(entry.startTime)} Uhr
              {entry.reason && (
                <span className="text-ink-muted"> · {entry.reason}</span>
              )}
            </span>
            {entry.cancelledAt ? (
              <span className="badge badge-declined">Ausgefallen</span>
            ) : (
              <span className={`badge ${view.badge}`}>{view.label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
