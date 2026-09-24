import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { myRelationLabel } from '../lib/participation';
import { groupTeams, teamMeta } from '../lib/teams';
import AppLayout from './AppLayout';

// Reihenfolge der eigenen Zuordnungen: Trainer:in, Spieler:in, verfolgt.
const RELATION_ORDER = ['coach', 'player', 'fan'];

const TABS = [
  { key: 'meine', label: 'Meine Mannschaften' },
  { key: 'alle', label: 'Alle Mannschaften' },
];

/**
 * Mannschaften (`/teams`) – zwei Reiter, eine Kartensprache.
 *
 * ── Warum Reiter ───────────────────────────────────────────────────────────
 * Vorher standen beide Listen untereinander auf einer Seite. Wer in vier
 * Mannschaften ist, scrollte an seinen eigenen vorbei, um den Verein zu
 * sehen – und wer in keiner ist, an einem leeren Kasten. Als Reiter ist beides
 * einen Klick weit weg, und der aktive Reiter steht in der Adresse
 * (`?ansicht=alle`), lässt sich also verlinken.
 *
 * ── Warum dieselbe Karte ───────────────────────────────────────────────────
 * „Meine Mannschaften" war eine schmale Chip-Liste, „Alle Mannschaften" ein
 * Kartenraster – zwei Darstellungen derselben Sache auf derselben Seite. Jetzt
 * ist es dieselbe <TeamCard>; bei den eigenen trägt sie zusätzlich die eigene
 * Rolle und den Hinweis auf eine ausstehende Bestätigung.
 */
export default function TeamsPage() {
  const { teams: myTeams } = useAuth();
  const { teams: allTeams, loading, error } = useTeams();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('ansicht');
  const activeTab = TABS.some((tab) => tab.key === requested) ? requested : 'meine';

  const selectTab = (key) => {
    // `replace`, damit das Hin und Her zwischen zwei Reitern nicht die
    // Browser-Historie füllt.
    setSearchParams(key === 'meine' ? {} : { ansicht: key }, { replace: true });
  };

  // Mannschaften, in denen das Mitglied selbst eingetragen ist – für die
  // Markierung in der Gesamtliste.
  const myTeamIds = useMemo(
    () => new Set(myTeams.map((team) => team.id)),
    [myTeams]
  );

  // Das Profil kennt zu einer eigenen Mannschaft nur id, code, name und die
  // Beziehung. Altersklasse, Geschlecht und Ligaanbindung stehen in der
  // öffentlichen Mannschaftsliste – zusammengeführt sieht die eigene Karte
  // genauso vollständig aus wie die in „Alle Mannschaften".
  const myTeamsDetailed = useMemo(
    () =>
      myTeams.map((team) => ({
        ...(allTeams.find((entry) => entry.id === team.id) ?? {}),
        ...team,
      })),
    [myTeams, allTeams]
  );

  return (
    <AppLayout width="max-w-4xl">
      <header>
        <h1 className="page-title">Mannschaften</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Deine Zuordnungen und alle Mannschaften der HSG Hinterland.
        </p>
      </header>

      <div className="tabs mt-6" role="tablist" aria-label="Ansicht der Mannschaften">
        {TABS.map((tab) => (
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
            {tab.key === 'meine' && myTeams.length > 0 && (
              <span className="badge badge-neutral ml-2">{myTeams.length}</span>
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
        {activeTab === 'meine' ? (
          <MyTeamsView
            teams={myTeamsDetailed}
            onShowAll={() => selectTab('alle')}
          />
        ) : (
          <AllTeamsView
            teams={allTeams}
            myTeamIds={myTeamIds}
            loading={loading}
            error={error}
          />
        )}
      </div>
    </AppLayout>
  );
}

/** Reiter „Meine Mannschaften": nach eigener Rolle gruppierte Karten. */
function MyTeamsView({ teams, onShowAll }) {
  if (teams.length === 0) {
    return (
      <div className="panel">
        <div className="panel__body">
          <p className="card-note">
            Du bist noch keiner Mannschaft zugeordnet. Unter „Mein Konto“ legst
            du fest, wo du mitspielst, trainierst oder zuschaust – danach
            erscheinen hier deine Mannschaften samt Terminen.
          </p>
          <button
            type="button"
            onClick={onShowAll}
            className="btn btn-outline btn-sm mt-4"
          >
            Alle Mannschaften ansehen
          </button>
        </div>
      </div>
    );
  }

  const groups = RELATION_ORDER.map((relation) => ({
    relation,
    entries: teams.filter((team) => team.relationType === relation),
  })).filter((group) => group.entries.length > 0);

  const hasPending = teams.some((team) => !team.isConfirmed);

  return (
    <div className="space-y-6">
      {groups.map(({ relation, entries }) => (
        <section key={relation} className="panel">
          <div className="panel__header">
            <h2 className="section-title text-base">{myRelationLabel(relation)}</h2>
            <span className="eyebrow">
              {entries.length === 1 ? '1 Mannschaft' : `${entries.length} Mannschaften`}
            </span>
          </div>
          <div className="panel__body">
            <ul className="grid gap-3 sm:grid-cols-2">
              {entries.map((team) => (
                <li key={`${relation}-${team.id}`}>
                  <TeamCard team={team} pending={!team.isConfirmed} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {hasPending && (
        <p className="text-xs text-warn">
          „Ausstehend" bedeutet: der/die Trainer:in muss deine Mitgliedschaft
          noch bestätigen.
        </p>
      )}
    </div>
  );
}

/** Reiter „Alle Mannschaften": nach Senioren und Jugend gruppierte Karten. */
function AllTeamsView({ teams, myTeamIds, loading, error }) {
  if (error) {
    return (
      <div role="alert" className="alert alert-error">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <span key={row} className="skeleton h-20 w-full" />
        ))}
      </div>
    );
  }

  if (teams.length === 0) {
    return <p className="card-note">Keine Mannschaften hinterlegt.</p>;
  }

  return (
    <div className="space-y-6">
      {groupTeams(teams).map((group) => (
        <section key={group.key} className="panel">
          <div className="panel__header">
            <h2 className="section-title text-base">{group.label}</h2>
            <span className="eyebrow">{group.hint}</span>
          </div>
          <div className="panel__body">
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.teams.map((team) => (
                <li key={team.id}>
                  <TeamCard team={team} isMine={myTeamIds.has(team.id)} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Eine Mannschaftskarte: Kürzel, Name, Altersklasse und Geschlecht.
 *
 * Dieselbe Karte in beiden Reitern. `isMine` markiert in der Gesamtliste die
 * eigenen Mannschaften, `pending` in der eigenen Liste eine Zuordnung, die das
 * Trainerteam noch bestätigen muss.
 *
 * Das Foto der Mannschaft bleibt bewusst weg. Im Raster wäre es entweder
 * briefmarkengroß (und damit nutzlos) oder es würde die Karte dominieren –
 * und Mannschaften ohne Foto sähen in derselben Liste kaputt aus.
 */
function TeamCard({ team, isMine = false, pending = false }) {
  const meta = teamMeta(team);

  return (
    <Link
      to={`/teams/${team.code}`}
      className={`flex min-h-20 items-center gap-3 rounded-md border bg-paper p-3.5 shadow-card transition-colors hover:border-hsg-green ${
        pending ? 'border-warn-line' : 'border-line'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md font-display text-sm font-bold uppercase leading-none tracking-[0.02em] ${
          pending
            ? 'bg-warn-soft text-warn'
            : 'bg-hsg-green-soft text-hsg-green-darker'
        }`}
      >
        {team.code}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-display text-base font-bold uppercase tracking-[0.02em] text-ink">
            {team.name}
          </span>
          {pending && <span className="badge badge-pending">ausstehend</span>}
          {isMine && <span className="badge badge-confirmed">dabei</span>}
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {meta}
          </span>
        )}
        {team.handballTeamId && (
          <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            <span className="status-dot bg-hsg-green" aria-hidden="true" />
            Im Spielbetrieb
          </span>
        )}
      </span>

      <ChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-ink-muted"
      />
    </Link>
  );
}
