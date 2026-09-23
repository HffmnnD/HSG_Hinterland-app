import { useState } from 'react';

import { apiFetch } from '../../lib/api';
import { useEventSeries } from '../../hooks/useSchedule';
import {
  eventTypeLabel,
  formatIsoRange,
  weekdayList,
} from '../../lib/schedule';
import EventForm from './EventForm';
import TeamAbsences from './TeamAbsences';

/**
 * Planungsbereich für Trainer:innen: Termine anlegen und laufende
 * Trainingsserien verwalten.
 *
 * Das Bearbeiten und Löschen EINZELNER Termine passiert bewusst dort, wo sie
 * stehen – im Reiter „Nächste Termine" an der jeweiligen Karte.
 *
 * @param {{ teams: object[], busy?: boolean,
 *           onRun: (action:() => Promise<any>, fallback?:string) => Promise<any>,
 *           onChanged: () => Promise<void>|void }} props
 *   `teams` sind die Mannschaften mit Verwaltungsrecht.
 */
export default function PlanningPanel({ teams, busy = false, onRun, onChanged }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const { series, loading, error, reload } = useEventSeries(teamId);

  const handleCreate = async (payload) => {
    const created = await onRun(
      () =>
        apiFetch('/api/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      'Termin angelegt.'
    );
    if (created) {
      setCreating(false);
      await reload();
      await onChanged();
    }
  };

  const handleDeleteSeries = async (entry) => {
    const removed = await onRun(
      () => apiFetch(`/api/events/series/${entry.id}`, { method: 'DELETE' }),
      'Serie beendet.'
    );
    if (removed) {
      await reload();
      await onChanged();
    }
  };

  if (teams.length === 0) {
    return (
      <p className="card-note">
        Du verwaltest aktuell keine Mannschaft. Termine anlegen können
        Trainer:innen der jeweiligen Mannschaft sowie die Administration.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------ Termin anlegen */}
      <section className={creating ? 'card' : 'card-accent'}>
        {creating ? (
          <>
            <p className="eyebrow">Neuer Termin</p>
            <h2 className="section-title mt-1.5 text-base">
              Training, Sondertermin oder Serie
            </h2>
            <div className="mt-5">
              <EventForm
                teams={teams}
                defaultTeamId={teamId}
                busy={busy}
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title text-base">Termine planen</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Wiederkehrendes Training, einmalige Zusatztermine oder ein
                mehrtägiges Camp – der Kader sieht es sofort.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn btn-primary btn-sm"
            >
              Termin anlegen
            </button>
          </div>
        )}
      </section>

      {/* ------------------------------------------ Ausfälle im Kader */}
      <section>
        <h2 className="section-title">Längerfristige Ausfälle</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Urlaub und Verletzungen aus dem Kader. Betroffene Termine sind
          automatisch als Absage hinterlegt – hier stehen sie am Stück.
        </p>
        <TeamAbsences teamId={teamId} />
      </section>

      {/* -------------------------------------------------- Serien-Liste */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Trainingsserien</h2>
          {teams.length > 1 && (
            <select
              aria-label="Mannschaft der Serienübersicht"
              value={teamId ?? ''}
              onChange={(event) => setTeamId(Number(event.target.value))}
              className="field-control-sm"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <p role="alert" className="alert alert-error mt-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-3 space-y-2">
            <span className="skeleton h-20 w-full" />
          </div>
        ) : series.length === 0 ? (
          <p className="card-note mt-3">
            Noch keine Serie angelegt. Über „Termin anlegen" →
            „Wiederkehrend" entsteht der feste Trainingsplan.
          </p>
        ) : (
          <ul className="list-panel mt-3">
            {series.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold uppercase tracking-[0.03em] text-ink">
                      {entry.title}
                    </span>
                    <span className="badge badge-neutral">
                      {eventTypeLabel(entry.type)}
                    </span>
                    {entry.reasonsVisibleToAll && (
                      <span className="badge badge-confirmed">
                        Gründe öffentlich
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {weekdayList(entry.weekdays)} · {entry.startTime} –{' '}
                    {entry.endTime} Uhr
                    {entry.location ? ` · ${entry.location}` : ''}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {formatIsoRange(entry.startsOn, entry.endsOn)} ·{' '}
                    {entry.eventCount} Termine, {entry.upcomingCount} noch
                    offen
                  </span>
                </span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDeleteSeries(entry)}
                  className="btn btn-danger btn-sm"
                >
                  Serie beenden
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="field-hint">
          „Serie beenden" entfernt alle noch nicht begonnenen Termine dieser
          Serie. Vergangene Einheiten bleiben mitsamt Anwesenheiten in der
          Historie erhalten.
        </p>
      </section>
    </div>
  );
}
