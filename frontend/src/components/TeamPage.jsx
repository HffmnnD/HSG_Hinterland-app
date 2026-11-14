import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { apiFetch } from '../lib/api';
import { useHandballSchedule, useHandballTable } from '../hooks/useHandball';
import { useAuth } from '../context/AuthContext';
import AppLayout from './AppLayout';
import TableWidget from './handball/TableWidget';
import ScheduleWidget from './handball/ScheduleWidget';
import TeamHero from './team/TeamHero';
import NextGameCard from './team/NextGameCard';
import LiveGameCard from './team/LiveGameCard';
import RosterSection from './team/RosterSection';
import TeamManagePanel from './team/TeamManagePanel';
import PlayerSheet from './team/PlayerSheet';
import TrainingSection from './schedule/TrainingSection';
import FinesSection from './fines/FinesSection';
import { HeroSkeleton, ListSkeleton } from './team/Skeleton';

// Reiter der Seite. `key` steht im Adressfeld (?tab=kader), damit ein Link auf
// den Kader auch als Link auf den Kader wieder aufgeht – und der
// Zurück-Knopf des Browsers funktioniert.
const TABS = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'spielplan', label: 'Spielplan & Tabelle' },
  { key: 'kader', label: 'Kader' },
];
const TRAINING_TAB = { key: 'training', label: 'Teamplaner' };
const MANAGE_TAB = { key: 'verwaltung', label: 'Verwaltung' };
// Strafenkatalog – mannschaftsintern, von Trainer:innen ein- und ausschaltbar.
// (Spielberichte stehen unter Verein → Infos und auf der Spielseite.)
const FINES_TAB = { key: 'kasse', label: 'Kasse' };

// Umschalter im Spielplan-Reiter. Die Tabelle ist vorausgewählt.
const SCHEDULE_MODES = [
  { key: 'table', label: 'Tabelle' },
  { key: 'upcoming', label: 'Nächste Spiele' },
  { key: 'past', label: 'Ergebnisse' },
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
function LeagueFallback() {
  return (
    <p className="card-note">Keine Ligaspiele.</p>
  );
}

function TeamView({ code }) {
  const { can } = useAuth();
  const navigate = useNavigate();
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

  const [scheduleMode, setScheduleMode] = useState('table');
  const [openMember, setOpenMember] = useState(null);

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
  const isAdmin = can('teams.edit');
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

  const isMember = data?.isMember ?? false;
  // Teamplaner und Kasse lassen sich je Mannschaft abschalten (Verwaltung).
  const plannerOn = data?.team?.plannerEnabled !== false;
  const finesOn = data?.team?.finesEnabled !== false;
  // Teamplaner (Training, Zu-/Absagen, Beteiligung) direkt in der Mannschaft.
  const tabs = [
    TABS[0],
    ...(isMember && plannerOn ? [TRAINING_TAB] : []),
    ...TABS.slice(1),
    ...((isMember || canManage) && finesOn ? [FINES_TAB] : []),
    ...(canManage ? [MANAGE_TAB] : []),
  ];
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : 'uebersicht';

  const selectTab = (key) => {
    // `replace`, damit das Blättern durch die Reiter nicht die gesamte
    // Browser-Historie füllt.
    setSearchParams(key === 'uebersicht' ? {} : { tab: key }, { replace: true });
    setOpenMember(null);
  };

  /**
   * Führt eine Verwaltungsaktion aus und lädt danach neu. Zeigt bevorzugt die
   * Meldung aus der Server-Antwort (z. B. „… hat jetzt die Rolle Trainer:in").
   *
   * Gibt die Server-Antwort zurück (bzw. `null`, wenn es schiefging), damit
   * Aufrufer daran anknüpfen können – der Foto-Upload öffnet danach
   * beispielsweise den Dialog für den Bildausschnitt, aber nur bei Erfolg.
   *
   * @returns {Promise<object|null>}
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
      return result ?? {};
    } catch (err) {
      setError(err.message);
      return null;
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
      <Shell>
        <HeroSkeleton />
        <div className="mt-6">
          <ListSkeleton rows={3} />
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div role="alert" className="alert alert-error">
          {error ?? 'Mannschaft konnte nicht geladen werden.'}
        </div>
      </Shell>
    );
  }

  const { team, members } = data;
  const pendingMembers = data.pendingMembers ?? [];

  // Spielseite (Live-Ticker / Spielbericht) eines Spiels dieser Mannschaft.
  // Der Teamname reist im Link-Zustand mit – so zeigt die Spielseite ihn in
  // der Kopfzeile, ohne die Mannschaft noch einmal zu laden.
  const gamePath = (game) =>
    `/teams/${encodeURIComponent(code)}/spiele/${encodeURIComponent(game.id)}`;
  const gameLinkState = (fromTab) => ({ teamName: team.name, fromTab });

  return (
    <Shell name={team.name}>
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          {error}
        </div>
      )}
      {notice && <div className="alert alert-success mb-4">{notice}</div>}

      {/* -------------------------------------------------- Live-Hinweis */}
      {/* Schmal und nur außerhalb der Übersicht – dort steht die Karte
          „Aktuelles Spiel" mit Live-Stand. Ein Tipp führt zum Ticker. */}
      {liveGame && activeTab !== 'uebersicht' && (
        <Link
          to={liveGame.id ? gamePath(liveGame) : '?tab=uebersicht'}
          state={liveGame.id ? gameLinkState('uebersicht') : undefined}
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-hsg-green-line bg-hsg-green-soft px-3 py-2 text-sm transition-colors hover:border-hsg-green"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="badge badge-live shrink-0">
              <span className="live-dot" aria-hidden="true" />
              Live
            </span>
            <span className="truncate text-ink-soft">
              {liveGame.home?.name} – {liveGame.away?.name}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-hsg-green-dark">
            Zum Ticker
          </span>
        </Link>
      )}

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
              <LeagueFallback />
            ) : (
              <>
                {scheduleLoading ? (
                  <ListSkeleton rows={1} />
                ) : liveGame ? (
                  // Während des Spiels: „Aktuelles Spiel" mit Live-Stand,
                  // Klick öffnet den Live-Ticker.
                  <LiveGameCard
                    game={liveGame}
                    to={liveGame.id ? gamePath(liveGame) : null}
                    linkState={gameLinkState('uebersicht')}
                  />
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
              <LeagueFallback />
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
                    {scheduleMode === 'table' ? (
                      <TableWidget
                        teamId={handballTeamId}
                        highlightTeamId={handballTeamId}
                      />
                    ) : scheduleLoading ? (
                      <ListSkeleton rows={4} />
                    ) : (
                      <ScheduleWidget
                        teamId={handballTeamId}
                        title="Spielplan"
                        mode={scheduleMode}
                        // Jedes Spiel mit ID öffnet die Spielseite: live den
                        // Ticker, danach den ausführlichen Spielbericht.
                        onSelectGame={(game) =>
                          navigate(gamePath(game), { state: gameLinkState('spielplan') })
                        }
                      />
                    )}
                  </div>
                </section>

                {scheduleMeta?.available === false && (
                  <p className="field-hint">
                    nuLiga nicht erreichbar, zuletzt geladener Stand.
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
            onOpenMember={isMember ? setOpenMember : undefined}
          />
        )}

        {/* ------------------------------------------------ Teamplaner */}
        {activeTab === 'training' && isMember && (
          <TrainingSection
            teamId={team.id}
            tab={searchParams.get('bereich')}
            onTabChange={(key) =>
              setSearchParams(key === 'anstehend' ? { tab: 'training' } : { tab: 'training', bereich: key }, { replace: true })
            }
          />
        )}

        {/* ------------------------------------------------------- Kasse */}
        {activeTab === 'kasse' && (isMember || canManage) && finesOn && <FinesSection teamId={team.id} />}

        {/* -------------------------------------------------- Verwaltung */}
        {activeTab === 'verwaltung' && canManage && (
          <TeamManagePanel
            code={code}
            team={team}
            isAdmin={isAdmin}
            pendingMembers={pendingMembers}
            members={members}
            busy={busy}
            onRun={run}
            reloadToken={reloadToken}
          />
        )}

      {openMember && (
        <PlayerSheet
          code={code}
          member={openMember}
          onClose={() => setOpenMember(null)}
          onOpenTraining={() => {
            setOpenMember(null);
            setSearchParams({ tab: 'training', bereich: 'beteiligung' }, { replace: true });
          }}
        />
      )}
      </div>
    </Shell>
  );
}

/**
 * Rahmen der Mannschaftsseite.
 *
 * In der Kopfzeile steht links der Mannschaftsname als Weg zurück zur
 * Übersicht. Das grüne Kürzel-Abzeichen, das früher davor klebte, ist
 * ersatzlos entfallen: Es stand direkt neben dem ausgeschriebenen Namen
 * („MJC  Männliche Jugend C") und sagte dort nichts, was der Name nicht schon
 * sagte – während es die Kopfzeile bunt machte und auf schmalen Bildschirmen
 * Platz vom Namen nahm. Wo das Kürzel wirklich trägt (Mannschaftsübersicht,
 * Chips in der Verwaltung), steht es weiterhin.
 */
function Shell({ name, children }) {
  return (
    <AppLayout
      width="max-w-4xl"
      header={
        <Link
          to="/teams"
          className="group flex min-w-0 items-center gap-1.5"
          title="Zurück zur Mannschaftsübersicht"
        >
          <ChevronLeft
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ink-muted transition-colors group-hover:text-hsg-green-dark"
          />
          <span className="header-title">{name ?? 'Mannschaft'}</span>
        </Link>
      }
    >
      {children}
    </AppLayout>
  );
}
