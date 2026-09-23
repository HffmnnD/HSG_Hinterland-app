import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../hooks/useSchedule';
import { shiftIsoDate, toDateInput } from '../lib/schedule';
import AppLayout from './AppLayout';
import UpcomingPanel from './schedule/UpcomingPanel';
import AbsencePanel from './schedule/AbsencePanel';
import HistoryPanel from './schedule/HistoryPanel';
import PlanningPanel from './schedule/PlanningPanel';
import EventForm from './schedule/EventForm';

// Wie weit die Liste im Rückblick zurückreicht. Für „was war letzte Woche?"
// reicht ein Monat – alles Ältere steht im Reiter „Historie".
const LOOKBACK_DAYS = 30;

/**
 * Reiter „Termine" – Trainingsplan, Sondertermine und Anwesenheiten.
 *
 * Eine Seite für beide Rollen: Spieler:innen sehen Zu-/Absage-Knöpfe,
 * Trainer:innen zusätzlich die Kaderübersicht und den Planungsbereich.
 * Welche Reiter erscheinen, ergibt sich aus den Mannschaftsrechten, die das
 * Backend mit der Terminliste zurückgibt – nicht aus der globalen Rolle.
 */
export default function SchedulePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [teamFilter, setTeamFilter] = useState(null);
  const [lookback, setLookback] = useState(false);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // Termin, der gerade bearbeitet bzw. gelöscht wird (null = keiner).
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const today = toDateInput();
  const {
    events,
    teams,
    loading,
    error: loadError,
    reload,
  } = useEvents({
    teamId: teamFilter,
    from: lookback ? shiftIsoDate(today, -LOOKBACK_DAYS) : today,
  });

  const playerTeams = useMemo(
    () => teams.filter((team) => team.isPlayer),
    [teams]
  );
  const managedTeams = useMemo(
    () => teams.filter((team) => team.canManage),
    [teams]
  );

  // Die Panels leiten ihren Anfangszustand aus `teams` ab (erste Mannschaft
  // vorausgewählt). Beim ersten Rendern ist die Liste noch leer – der Schlüssel
  // baut sie neu auf, sobald sie da ist oder sich ändert.
  const teamKey = teams.map((team) => team.id).join('-');

  const tabs = [
    { key: 'naechste', label: 'Nächste Termine' },
    ...(playerTeams.length > 0
      ? [{ key: 'abwesenheiten', label: 'Meine Abwesenheiten' }]
      : []),
    { key: 'historie', label: 'Historie & Statistik' },
    ...(managedTeams.length > 0
      ? [{ key: 'planung', label: 'Planung' }]
      : []),
  ];

  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : 'naechste';

  const selectTab = (key) => {
    setEditing(null);
    setDeleting(null);
    // `replace`, damit das Blättern durch die Reiter nicht die Historie füllt.
    setSearchParams(key === 'naechste' ? {} : { tab: key }, { replace: true });
  };

  /**
   * Führt eine schreibende Aktion aus und meldet das Ergebnis.
   * @returns {Promise<object|null>} null, wenn es schiefging
   */
  const run = async (action, fallback) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result?.message || fallback || null);
      return result ?? {};
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleRespond = async (eventId, status, reason, userId) => {
    const result = await run(() =>
      apiFetch('/api/attendances/respond', {
        method: 'POST',
        body: JSON.stringify({ eventId, status, reason, userId }),
      })
    );
    if (result) await reload();
  };

  const handleUpdate = async (payload, { scope }) => {
    const result = await run(() =>
      apiFetch(`/api/events/${editing.id}?scope=${scope}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    );
    if (result) {
      setEditing(null);
      await reload();
    }
  };

  const handleDelete = async (event, scope) => {
    const result = await run(() =>
      apiFetch(`/api/events/${event.id}?scope=${scope}`, { method: 'DELETE' })
    );
    if (result) {
      setDeleting(null);
      await reload();
    }
  };

  // Ohne Mannschaft gibt es nichts anzuzeigen – das ist kein Fehler, sondern
  // der Zustand vor der ersten Bestätigung durch den/die Trainer:in.
  const hasTeams = teams.length > 0;

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Termine</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Trainingszeiten, Sondertermine und Anwesenheiten deiner Mannschaften.
      </p>

      {(error || loadError) && (
        <div role="alert" className="alert alert-error mt-4">
          {error ?? loadError}
        </div>
      )}
      {notice && <div className="alert alert-success mt-4">{notice}</div>}

      {!loading && !hasTeams ? (
        <p className="card-note mt-6">
          Du bist noch keiner Mannschaft als Spieler:in oder Trainer:in
          zugeordnet. Sobald der/die Trainer:in deine Zuordnung bestätigt hat,
          erscheinen hier die Trainingszeiten.
        </p>
      ) : (
        <>
          {/* ------------------------------------------------------ Reiter */}
          <div
            className="tabs mt-6"
            role="tablist"
            aria-label="Bereiche des Terminplans"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`panel-${tab.key}`}
                onClick={() => selectTab(tab.key)}
                className={`tab ${activeTab === tab.key ? 'tab--active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className="mt-6"
          >
            {/* ------------------------------------------ Nächste Termine */}
            {activeTab === 'naechste' && (
              <div className="space-y-6">
                {/* Mannschaft und Zeitraum eingrenzen */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {teams.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTeamFilter(null)}
                        aria-pressed={teamFilter === null}
                        className={`chip chip-sm ${
                          teamFilter === null ? 'chip-active' : ''
                        }`}
                      >
                        Alle
                      </button>
                      {teams.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => setTeamFilter(team.id)}
                          aria-pressed={teamFilter === team.id}
                          title={team.name}
                          className={`chip chip-sm ${
                            teamFilter === team.id ? 'chip-active' : ''
                          }`}
                        >
                          {team.code}
                        </button>
                      ))}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setLookback((value) => !value)}
                    aria-pressed={lookback}
                    className={`chip chip-sm ${lookback ? 'chip-active' : ''} ${
                      teams.length > 1 ? 'ml-auto' : ''
                    }`}
                  >
                    Rückblick 30 Tage
                  </button>
                </div>

                {/* Bearbeiten-Formular direkt über der Liste */}
                {editing && (
                  <section className="card">
                    <p className="eyebrow">Termin bearbeiten</p>
                    <h2 className="section-title mt-1.5 text-base">
                      {editing.title}
                    </h2>
                    <div className="mt-5">
                      <EventForm
                        teams={managedTeams}
                        event={editing}
                        busy={busy}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  </section>
                )}

                {/* Löschen bestätigen – mit Wahl zwischen Termin und Serie */}
                {deleting && (
                  <section className="card-warn">
                    <h2 className="section-title text-base">
                      „{deleting.title}" wirklich löschen?
                    </h2>
                    <p className="mt-2 text-sm text-ink-soft">
                      Alle Rückmeldungen zu diesem Termin werden mit entfernt.
                      Das lässt sich nicht rückgängig machen.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(deleting, 'single')}
                        className="btn btn-danger btn-sm"
                      >
                        Nur diesen Termin
                      </button>
                      {deleting.seriesId && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDelete(deleting, 'series')}
                          className="btn btn-danger btn-sm"
                        >
                          Ganze Serie (ab heute)
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                        className="btn btn-ghost btn-sm"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </section>
                )}

                <UpcomingPanel
                  events={events}
                  viewerId={user?.id}
                  showTeam={teams.length > 1 && teamFilter === null}
                  loading={loading}
                  busy={busy}
                  onRespond={handleRespond}
                  onEdit={(event) => {
                    setDeleting(null);
                    setEditing(event);
                  }}
                  onDelete={(event) => {
                    setEditing(null);
                    setDeleting(event);
                  }}
                />

                {playerTeams.length > 0 && events.length > 0 && (
                  <p className="field-hint">
                    Du bist automatisch bei jedem Termin dabei. Nur wenn du
                    nicht kannst, meldest du dich mit Grund ab. Für längere
                    Zeiträume gibt es den Reiter „Meine Abwesenheiten".
                  </p>
                )}
              </div>
            )}

            {/* ------------------------------------ Meine Abwesenheiten */}
            {activeTab === 'abwesenheiten' && (
              <AbsencePanel
                key={teamKey}
                teams={playerTeams}
                busy={busy}
                onRun={run}
                onChanged={reload}
              />
            )}

            {/* ---------------------------------------- Historie & Statistik */}
            {activeTab === 'historie' && (
              <HistoryPanel
                key={teamKey}
                teams={teams}
                defaultTeamId={teamFilter ?? teams[0]?.id ?? null}
              />
            )}

            {/* ------------------------------------------------- Planung */}
            {activeTab === 'planung' && (
              <PlanningPanel
                key={teamKey}
                teams={managedTeams}
                busy={busy}
                onRun={run}
                onChanged={reload}
              />
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
