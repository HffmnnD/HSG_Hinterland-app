import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useTeams } from '../hooks/useTeams';
import { useHandballSchedule, useHandballTable } from '../hooks/useHandball';
import { ADMIN_ROLES } from '../lib/roles';
import { useAuth } from '../context/AuthContext';
import AppLayout from './AppLayout';
import TableWidget from './handball/TableWidget';
import ScheduleWidget from './handball/ScheduleWidget';
import LiveTickerWidget from './handball/LiveTickerWidget';
import TeamHero from './team/TeamHero';
import NextGameCard from './team/NextGameCard';
import RosterSection from './team/RosterSection';
import TeamManagePanel from './team/TeamManagePanel';
import { HeroSkeleton, ListSkeleton } from './team/Skeleton';

// Reiter der Seite. `key` steht im Adressfeld (?tab=kader), damit ein Link auf
// den Kader auch als Link auf den Kader wieder aufgeht – und der
// Zurück-Knopf des Browsers funktioniert.
const TABS = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'spielplan', label: 'Spielplan & Tabelle' },
  { key: 'kader', label: 'Kader' },
];
const MANAGE_TAB = { key: 'verwaltung', label: 'Verwaltung' };

// Umschalter im Spielplan-Reiter.
const SCHEDULE_MODES = [
  { key: 'upcoming', label: 'Nächste Spiele' },
  { key: 'past', label: 'Ergebnisse' },
  { key: 'all', label: 'Gesamter Spielplan' },
];

// `key={code}` sorgt dafür, dass beim Wechsel der Mannschaft der komplette
// Zustand neu initialisiert wird – ohne setState im Effekt-Body.
export default function TeamPage() {
  const { code } = useParams();
  return <TeamView key={code} code={code} />;
}

/**
 * Hinweis, wenn die Mannschaft (noch) keine Ligaanbindung hat.
 * Bewusst freundlich formuliert: Für eine Jugendmannschaft ohne Ligabetrieb
 * ist das der Normalfall und kein Fehler.
 */
function LeagueFallback({ canManage }) {
  return (
    <p className="card-note">
      Ligaspiele für diese Saison noch nicht terminiert.
      {canManage && (
        <>
          {' '}
          Sobald die Mannschaft im Spielbetrieb gemeldet ist, kann ein:e
          Administrator:in die nuLiga-Nummer im Reiter „Verwaltung" eintragen –
          Tabelle, Spielplan und Live-Ticker erscheinen dann automatisch.
        </>
      )}
    </p>
  );
}

function TeamView({ code }) {
  const { user } = useAuth();
  const { teams: allTeams } = useTeams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Ein Zustandsobjekt statt vieler Einzel-States: `loading` ergibt sich
  // daraus, ob schon etwas geladen wurde (kein setState im Effekt-Body).
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // Zähler, der nach jeder Verwaltungsaktion hochgeht – daran hängt das
  // Nachladen der Kandidatenliste im Verwaltungsbereich.
  const [reloadToken, setReloadToken] = useState(0);

  const [scheduleMode, setScheduleMode] = useState('upcoming');

  const load = useCallback(async () => {
    const result = await apiFetch(`/api/teams/${encodeURIComponent(code)}`);
    setData(result);
    return result;
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(`/api/teams/${encodeURIComponent(code)}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const canManage = data?.canManage ?? false;
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const handballTeamId = data?.team?.handballTeamId ?? null;

  // Verbandsdaten. Ohne nuLiga-Nummer laden die Hooks bewusst nichts.
  const { games, meta: scheduleMeta, loading: scheduleLoading } =
    useHandballSchedule(handballTeamId);
  // Nur für Liga- und Saisonbezeichnung im Kopfbereich – die Tabelle selbst
  // lädt das TableWidget (aus dem Browser-Cache, siehe Cache-Control).
  const { table } = useHandballTable(handballTeamId);

  // Laufendes Spiel (für den Banner) und nächstes Spiel (für die Übersicht).
  // Vergangene Ergebnisse werden hier nicht mehr abgeleitet – sie stehen
  // ausschließlich im Reiter „Spielplan & Tabelle".
  const { liveGame, nextGame } = useMemo(() => {
    const byKickoff = (a, b) => new Date(a.startsAt) - new Date(b.startsAt);
    return {
      liveGame: games.find((game) => game.state === 'live') ?? null,
      nextGame:
        games
          .filter((game) => game.state === 'upcoming' && game.startsAt)
          .sort(byKickoff)[0] ?? null,
    };
  }, [games]);

  const tabs = canManage ? [...TABS, MANAGE_TAB] : TABS;
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : 'uebersicht';

  const selectTab = (key) => {
    // `replace`, damit das Blättern durch die Reiter nicht die gesamte
    // Browser-Historie füllt.
    setSearchParams(key === 'uebersicht' ? {} : { tab: key }, { replace: true });
  };

  /**
   * Führt eine Verwaltungsaktion aus und lädt danach neu. Zeigt bevorzugt die
   * Meldung aus der Server-Antwort (z. B. „… hat jetzt die Rolle Trainer:in").
   */
  const run = async (action, fallbackMessage) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      await load();
      setReloadToken((value) => value + 1);
      setNotice(result?.message || fallbackMessage || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDetails = (userId, relationType, fields) =>
    run(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}?relationType=${relationType}`,
          { method: 'PATCH', body: JSON.stringify(fields) }
        ),
      'Kaderangaben gespeichert.'
    );

  // ----------------------------------------------------------- Ladezustand
  if (loading) {
    return (
      <Shell code={code}>
        <HeroSkeleton />
        <div className="mt-6">
          <ListSkeleton rows={3} />
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell code={code}>
        <div role="alert" className="alert alert-error">
          {error ?? 'Mannschaft konnte nicht geladen werden.'}
        </div>
      </Shell>
    );
  }

  const { team, members } = data;
  const pendingMembers = data.pendingMembers ?? [];
  const otherTeams = allTeams.filter((entry) => entry.code !== team.code);

  return (
    <Shell code={team.code} name={team.name}>
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          {error}
        </div>
      )}
      {notice && <div className="alert alert-success mb-4">{notice}</div>}

      {/* ------------------------------------------------- Live-Ticker-Banner */}
      {/* Ganz oben und über allen Reitern: Wer die App öffnet, während gespielt
          wird, sucht genau das – und nichts anderes. */}
      {liveGame &&
        (liveGame.id ? (
          <div className="mb-6">
            <LiveTickerWidget gameId={liveGame.id} title="Jetzt live" />
          </div>
        ) : (
          // nuLiga legt den Spielbericht erst mit der ersten Meldung an –
          // bis dahin gibt es die Begegnung, aber noch keinen Ticker.
          <div className="card-accent mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title text-base">Jetzt live</h2>
              <span className="badge badge-live">
                <span className="live-dot" aria-hidden="true" />
                Live
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {liveGame.home?.name} – {liveGame.away?.name}
            </p>
            <p className="field-hint">
              Für dieses Spiel liegt noch kein Ticker vor. Sobald am
              Zeitnehmertisch die erste Aktion gemeldet wird, erscheint er hier.
            </p>
          </div>
        ))}

      {/* ------------------------------------------------------- Kopfbereich */}
      <TeamHero
        team={team}
        competition={table?.competition ?? nextGame?.competition ?? null}
        season={table?.season ?? null}
      />

      {/* ------------------------------------------------------------ Reiter */}
      <div className="tabs mt-6" role="tablist" aria-label="Bereiche der Mannschaftsseite">
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
            {tab.key === 'verwaltung' && pendingMembers.length > 0 && (
              <span className="badge badge-pending ml-2">
                {pendingMembers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mt-6"
      >
        {/* --------------------------------------------------- Übersicht */}
        {/* Bewusst nur zwei Dinge: das nächste Spiel und die Tabelle.
            Spielplan-Listen und vergangene Ergebnisse stehen ausschließlich im
            Reiter „Spielplan & Tabelle" – sonst wäre die Übersicht genau die
            überladene Seite, die sie ersetzen soll. */}
        {activeTab === 'uebersicht' && (
          <div className="space-y-6">
            {!handballTeamId ? (
              <LeagueFallback canManage={canManage} />
            ) : (
              <>
                {scheduleLoading ? (
                  <ListSkeleton rows={1} />
                ) : (
                  <NextGameCard game={nextGame} />
                )}

                <TableWidget
                  teamId={handballTeamId}
                  highlightTeamId={handballTeamId}
                />
              </>
            )}
          </div>
        )}

        {/* -------------------------------------------- Spielplan & Tabelle */}
        {activeTab === 'spielplan' && (
          <div className="space-y-8">
            {!handballTeamId ? (
              <LeagueFallback canManage={canManage} />
            ) : (
              <>
                <section>
                  <div
                    role="group"
                    aria-label="Spielplan-Ansicht"
                    className="flex flex-wrap gap-2"
                  >
                    {SCHEDULE_MODES.map((mode) => (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setScheduleMode(mode.key)}
                        aria-pressed={scheduleMode === mode.key}
                        className={`chip chip-sm ${
                          scheduleMode === mode.key ? 'chip-active' : ''
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    {scheduleLoading ? (
                      <ListSkeleton rows={4} />
                    ) : (
                      <ScheduleWidget
                        teamId={handballTeamId}
                        title="Spielplan"
                        mode={scheduleMode}
                      />
                    )}
                  </div>
                </section>

                <TableWidget
                  teamId={handballTeamId}
                  highlightTeamId={handballTeamId}
                />

                {scheduleMeta?.available === false && (
                  <p className="field-hint">
                    Hinweis: Die Verbandsseite antwortet gerade nicht. Angezeigt
                    wird, was zuletzt geladen werden konnte.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------------- Kader */}
        {activeTab === 'kader' && (
          <RosterSection
            players={members.player}
            staff={members.coach}
            canManage={canManage}
            busy={busy}
            onSaveDetails={handleSaveDetails}
          />
        )}

        {/* -------------------------------------------------- Verwaltung */}
        {activeTab === 'verwaltung' && canManage && (
          <TeamManagePanel
            code={code}
            team={team}
            isAdmin={isAdmin}
            pendingMembers={pendingMembers}
            members={members}
            otherTeams={otherTeams}
            busy={busy}
            onRun={run}
            reloadToken={reloadToken}
          />
        )}
      </div>
    </Shell>
  );
}

function Shell({ code, name, children }) {
  return (
    <AppLayout
      width="max-w-4xl"
      header={
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="badge badge-trainer shrink-0">
            {code?.toUpperCase()}
          </span>
          <span className="header-title">{name ?? 'Mannschaft'}</span>
        </div>
      }
    >
      {children}
    </AppLayout>
  );
}
