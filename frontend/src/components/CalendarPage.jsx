import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../hooks/useSchedule';
import { shiftIsoDate, toDateInput } from '../lib/schedule';
import AppLayout from './AppLayout';
import FilterBar from './schedule/FilterBar';
import UpcomingPanel from './schedule/UpcomingPanel';
import AbsencePanel from './schedule/AbsencePanel';
import ParticipationPanel from './schedule/ParticipationPanel';
import PlanningPanel from './schedule/PlanningPanel';
import {
  CancelDialog,
  DeleteDialog,
  EditDialog,
} from './schedule/EventDialogs';

// Wie weit der Rückblick zurückreicht. Für „was war letzte Woche?" reicht ein
// Monat – alles Ältere steht unter „Beteiligung".
const LOOKBACK_DAYS = 30;

/**
 * Reiter „Kalender" – Trainingszeiten, Spiele, Sondertermine, Anwesenheiten.
 *
 * Eine Seite für beide Rollen: Spieler:innen melden sich ab, Trainer:innen
 * sehen zusätzlich den Kader und den Planungsbereich. Welche Reiter
 * erscheinen, ergibt sich aus den Mannschaftsrechten, die das Backend mit der
 * Terminliste zurückgibt – nicht aus der globalen Rolle.
 */
export default function CalendarPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [teamFilter, setTeamFilter] = useState(null);
  const [category, setCategory] = useState(null);
  // Zeitraum: 'upcoming' = ab heute | 'lookback' = zusätzlich 30 Tage zurück |
  // 'custom' = die beiden Datumsfelder in `range`.
  const [rangeMode, setRangeMode] = useState('upcoming');
  const [range, setRange] = useState(() => ({
    from: toDateInput(),
    to: shiftIsoDate(toDateInput(), 30),
  }));

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  // Termin, für den gerade ein Dialog offen ist (jeweils null = keiner).
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  // Aus der Zeitraum-Wahl werden die beiden Parameter der Abfrage. Ein
  // eigener Zeitraum wird nur benutzt, wenn beide Daten gesetzt sind und
  // „von" nicht hinter „bis" liegt – sonst bliebe die Liste ohne Erklärung
  // leer, während jemand noch am Tippen ist.
  const today = toDateInput();
  const customUsable =
    rangeMode === 'custom' && range.from && range.to && range.from <= range.to;
  const query = customUsable
    ? { from: range.from, to: range.to }
    : {
        from:
          rangeMode === 'lookback'
            ? shiftIsoDate(today, -LOOKBACK_DAYS)
            : today,
      };

  const {
    events,
    teams,
    loading,
    error: loadError,
    reload,
  } = useEvents({ teamId: teamFilter, category, ...query });

  const playerTeams = useMemo(
    () => teams.filter((team) => team.isPlayer),
    [teams]
  );
  const managedTeams = useMemo(
    () => teams.filter((team) => team.canManage),
    [teams]
  );

  const tabs = [
    { key: 'anstehend', label: 'Anstehend' },
    ...(playerTeams.length > 0
      ? [{ key: 'abwesenheiten', label: 'Meine Abwesenheiten' }]
      : []),
    { key: 'beteiligung', label: 'Beteiligung' },
    ...(managedTeams.length > 0 ? [{ key: 'planung', label: 'Planung' }] : []),
  ];

  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : 'anstehend';

  const closeDialogs = () => {
    setEditing(null);
    setDeleting(null);
    setCancelling(null);
  };

  const selectTab = (key) => {
    closeDialogs();
    setSearchParams(key === 'anstehend' ? {} : { tab: key }, { replace: true });
  };

  // Die Panels leiten ihren Anfangszustand aus `teams` ab. Beim ersten Rendern
  // ist die Liste noch leer – der Schlüssel baut sie neu auf, sobald sie da ist.
  const teamKey = teams.map((team) => team.id).join('-');

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

  const handleCancel = async (event, cancelled, reason) => {
    const result = await run(() =>
      apiFetch(`/api/events/${event.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancelled, reason }),
      })
    );
    if (result) {
      setCancelling(null);
      await reload();
    }
  };

  const hasTeams = teams.length > 0;

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Kalender</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Trainingszeiten, Spiele und Anwesenheiten deiner Mannschaften.
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
          <div
            className="tabs mt-6"
            role="tablist"
            aria-label="Bereiche des Kalenders"
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
            {/* ------------------------------------------------ Anstehend */}
            {activeTab === 'anstehend' && (
              <div className="space-y-5">
                <FilterBar
                  teams={teams}
                  teamId={teamFilter}
                  onTeamChange={setTeamFilter}
                  category={category}
                  onCategoryChange={setCategory}
                  rangeMode={rangeMode}
                  onRangeModeChange={setRangeMode}
                  range={range}
                  onRangeChange={setRange}
                  lookbackDays={LOOKBACK_DAYS}
                />

                <UpcomingPanel
                  events={events}
                  viewerId={user?.id}
                  loading={loading}
                  busy={busy}
                  onRespond={handleRespond}
                  onEdit={setEditing}
                  onCancel={setCancelling}
                  onDelete={setDeleting}
                />
              </div>
            )}

            {activeTab === 'abwesenheiten' && (
              <AbsencePanel
                key={teamKey}
                teams={playerTeams}
                busy={busy}
                onRun={run}
                onChanged={reload}
              />
            )}

            {activeTab === 'beteiligung' && (
              <ParticipationPanel
                key={teamKey}
                teams={teams}
                defaultTeamId={teamFilter ?? teams[0]?.id ?? null}
              />
            )}

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

      {/* Dialoge zuletzt: Sie liegen fixiert über der Seite, damit die
          Rückfrage auch dann im Bild steht, wenn weit unten in einer langen
          Liste geklickt wurde. */}
      {editing && (
        <EditDialog
          event={editing}
          busy={busy}
          onSubmit={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
      {cancelling && (
        <CancelDialog
          event={cancelling}
          busy={busy}
          onConfirm={(cancelled, reason) =>
            handleCancel(cancelling, cancelled, reason)
          }
          onClose={() => setCancelling(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          event={deleting}
          busy={busy}
          onConfirm={(scope) => handleDelete(deleting, scope)}
          onClose={() => setDeleting(null)}
        />
      )}
    </AppLayout>
  );
}
