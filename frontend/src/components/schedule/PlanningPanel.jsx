import { useState } from 'react';

import { apiFetch } from '../../lib/api';
import { useEventSeries } from '../../hooks/useSchedule';
import { formatIsoRange, weekdayList } from '../../lib/schedule';
import EventForm from './EventForm';
import TeamAbsences from './TeamAbsences';

/**
 * Planungsbereich der Trainer:innen.
 *
 * Aufgebaut wie die Arbeit selbst: ZUERST die Mannschaft wählen, dann alles
 * für genau diese Mannschaft. Vorher standen Formular, Serienliste und
 * Ausfälle nebeneinander, jeweils mit eigener Mannschaftsauswahl – wer drei
 * Mannschaften trainiert, wusste nie, worauf sich was bezog.
 *
 * @param {{ teams: object[], busy?: boolean,
 *           onRun: (action:() => Promise<any>, fallback?:string) => Promise<any>,
 *           onChanged: () => Promise<void>|void }} props
 *   `teams` sind die Mannschaften mit Verwaltungsrecht.
 */
export default function PlanningPanel({ teams, busy = false, onRun, onChanged }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? null);
  // null = kein Formular offen, sonst 'series' | 'single'
  const [creating, setCreating] = useState(null);

  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const { series, loading, error, reload } = useEventSeries(teamId);

  if (teams.length === 0) {
    return (
      <p className="card-note">
        Du verwaltest aktuell keine Mannschaft. Planen können Trainer:innen der
        jeweiligen Mannschaft sowie die Administration.
      </p>
    );
  }

  const handleCreate = async (payload) => {
    const created = await onRun(
      () =>
        apiFetch('/api/events', {
          method: 'POST',
          body: JSON.stringify({ ...payload, teamId }),
        }),
      'Gespeichert.'
    );
    if (created) {
      setCreating(null);
      await reload();
      await onChanged();
    }
  };

  const handleDeleteSeries = async (entry) => {
    const removed = await onRun(
      () => apiFetch(`/api/events/series/${entry.id}`, { method: 'DELETE' }),
      'Trainingszeit beendet.'
    );
    if (removed) {
      await reload();
      await onChanged();
    }
  };

  const handleNuliga = async (enabled) => {
    const result = await onRun(() =>
      apiFetch('/api/events/nuliga', {
        method: 'POST',
        body: JSON.stringify({ teamId, enabled }),
      })
    );
    if (result) await onChanged();
  };

  return (
    <div className="space-y-8">
      {/* ------------------------------------------ 1. Mannschaft wählen */}
      {teams.length > 1 && (
        <section>
          <p className="eyebrow">Mannschaft</p>
          <div
            role="group"
            aria-label="Mannschaft für die Planung"
            className="mt-2 flex flex-wrap gap-1.5"
          >
            {teams.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setTeamId(entry.id);
                  setCreating(null);
                }}
                aria-pressed={teamId === entry.id}
                className={`chip ${teamId === entry.id ? 'chip-active' : ''}`}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------- 2. Trainingszeiten */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Trainingszeiten</h2>
          {creating === null && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreating('series')}
                className="btn btn-primary btn-sm"
              >
                Trainingszeit
              </button>
              <button
                type="button"
                onClick={() => setCreating('single')}
                className="btn btn-outline btn-sm"
              >
                Einzeltermin
              </button>
            </div>
          )}
        </div>

        {creating !== null && (
          <div className="card mt-3">
            <p className="eyebrow">
              {creating === 'series'
                ? 'Wiederkehrende Trainingszeit'
                : 'Einzelner Termin'}
              {team && ` · ${team.name}`}
            </p>
            <div className="mt-4">
              <EventForm
                mode={creating}
                busy={busy}
                onSubmit={handleCreate}
                onCancel={() => setCreating(null)}
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="alert alert-error mt-3">
            {error}
          </p>
        )}

        {loading ? (
          <span className="skeleton mt-3 h-20 w-full" />
        ) : series.length === 0 ? (
          <p className="card-note mt-3">
            Noch keine feste Trainingszeit hinterlegt.
          </p>
        ) : (
          <ul className="list-panel mt-3">
            {series.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {weekdayList(entry.weekdays)} · {entry.startTime} –{' '}
                    {entry.endTime} Uhr
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {entry.location ?? 'Ort offen'} ·{' '}
                    {formatIsoRange(entry.startsOn, entry.endsOn)} ·{' '}
                    {entry.upcomingCount} Termine offen
                  </span>
                </span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDeleteSeries(entry)}
                  className="btn btn-danger btn-sm"
                >
                  Beenden
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------- 3. Ligaspiele */}
      <section>
        <h2 className="section-title">Ligaspiele aus nuLiga</h2>

        {!team?.handballTeamId ? (
          <p className="card-note mt-3">
            Für diese Mannschaft ist keine nuLiga-Nummer hinterlegt. Ein:e
            Administrator:in kann sie auf der Mannschaftsseite eintragen –
            danach lassen sich die Ligaspiele hier übernehmen.
          </p>
        ) : (
          <div className="card mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-soft">
                Spiele automatisch in den Kalender übernehmen. Sie zählen dann
                wie jeder andere Termin: Der Kader kann sich abmelden, und die
                Beteiligung lässt sich getrennt auswerten.
              </p>
              {team.nuligaSyncEnabled && team.nuligaSyncedAt && (
                <p className="field-hint">
                  Zuletzt abgeglichen:{' '}
                  {new Date(team.nuligaSyncedAt).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  Uhr
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {team.nuligaSyncEnabled && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleNuliga(true)}
                  className="btn btn-outline btn-sm"
                >
                  Aktualisieren
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => handleNuliga(!team.nuligaSyncEnabled)}
                className={`btn btn-sm ${
                  team.nuligaSyncEnabled ? 'btn-danger' : 'btn-primary'
                }`}
              >
                {team.nuligaSyncEnabled ? 'Ausschalten' : 'Einschalten'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------ 4. Ausfälle im Kader */}
      <section>
        <h2 className="section-title">Längerfristige Ausfälle</h2>
        <TeamAbsences teamId={teamId} />
      </section>
    </div>
  );
}
