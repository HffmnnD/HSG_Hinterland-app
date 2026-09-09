import { Badge } from '../Badge';
import { useHandballSchedule } from '../../hooks/useHandball';
import {
  describeSource,
  formatKickoff,
  formatScore,
  gameStatus,
} from '../../lib/handball';

/**
 * Eine Zeile des Spielplans: Status, Anwurf, Begegnung, Ergebnis.
 *
 * @param {{ game: object, ownTeamId: string|null,
 *           onSelectGame?: (game:object) => void }} props
 */
function GameRow({ game, ownTeamId, onSelectGame }) {
  const status = gameStatus(game.state);

  const isOwn = (team) =>
    ownTeamId && team?.id ? String(team.id) === String(ownTeamId) : false;

  // Gewonnen/verloren nur bei beendeten Spielen und nur aus Sicht der eigenen
  // Mannschaft – ohne eigene Mannschaft bleibt die Zeile neutral.
  const ownGoals = game.isHome ? game.homeGoals : game.awayGoals;
  const otherGoals = game.isHome ? game.awayGoals : game.homeGoals;
  const result =
    game.state !== 'finished' ||
    game.isHome === null ||
    ownGoals === null ||
    otherGoals === null
      ? null
      : ownGoals > otherGoals
        ? 'win'
        : ownGoals < otherGoals
          ? 'loss'
          : 'draw';

  // Ein laufendes Spiel ist anklickbar (führt zum Ticker) – aber nur, wenn
  // die Seite dafür einen Handler mitgibt.
  const clickable = Boolean(onSelectGame && game.id);

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow truncate">
          {formatKickoff(game.startsAt)}
          {game.venue?.name ? ` · ${game.venue.name}` : ''}
        </span>

        <Badge variant={status.variant} className="shrink-0">
          {game.state === 'live' && <span className="live-dot" aria-hidden="true" />}
          {status.label}
        </Badge>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <p className={isOwn(game.home) ? 'font-bold text-ink' : 'text-ink-soft'}>
            {game.home.name ?? 'Heim'}
          </p>
          <p className={isOwn(game.away) ? 'font-bold text-ink' : 'text-ink-soft'}>
            {game.away.name ?? 'Gast'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={[
              'font-display text-lg font-bold leading-none tabular-nums',
              result === 'win'
                ? 'text-hsg-green-dark'
                : result === 'loss'
                  ? 'text-danger'
                  : 'text-ink',
            ].join(' ')}
          >
            {formatScore(game.homeGoals, game.awayGoals)}
          </p>
          {game.homeGoalsHalftime !== null && game.awayGoalsHalftime !== null && (
            <p className="mt-1 text-xs text-ink-muted tabular-nums">
              HZ {game.homeGoalsHalftime}:{game.awayGoalsHalftime}
            </p>
          )}
        </div>
      </div>

      {game.competition && (
        <p className="mt-2 truncate text-xs text-ink-muted">{game.competition}</p>
      )}
    </>
  );

  return (
    <li>
      {clickable ? (
        <button
          type="button"
          onClick={() => onSelectGame(game)}
          className="w-full px-4 py-3.5 text-left transition-colors hover:bg-surface"
        >
          {content}
        </button>
      ) : (
        <div className="px-4 py-3.5">{content}</div>
      )}
    </li>
  );
}

/**
 * Spielplan einer Mannschaft: kommende Spiele und letzte Ergebnisse.
 *
 * Die Aufteilung ist Absicht – im Verein interessiert vor dem Wochenende
 * „wann und wo spielen wir?" und danach „wie ist es ausgegangen?". Beides in
 * einer durchlaufenden Liste würde das Wichtige verstecken.
 *
 * `mode` steuert, welche Abschnitte erscheinen:
 *   'split'    (Standard) laufend + nächste Spiele + letzte Ergebnisse
 *   'upcoming' nur kommende Spiele
 *   'past'     nur Ergebnisse
 *   'all'      der komplette Spielplan als eine Liste, chronologisch
 * Bei 'upcoming', 'past' und 'all' gelten die Limits NICHT – wer gezielt
 * umschaltet, will alles sehen.
 *
 * @param {{ teamId: string,
 *           title?: string,
 *           mode?: 'split'|'upcoming'|'past'|'all',
 *           upcomingLimit?: number,
 *           pastLimit?: number,
 *           onSelectGame?: (game:object) => void }} props
 */
export default function ScheduleWidget({
  teamId,
  title = 'Spielplan',
  mode = 'split',
  upcomingLimit = 5,
  pastLimit = 5,
  onSelectGame,
}) {
  const { games, meta, loading, error } = useHandballSchedule(teamId);

  // Nach Anwurfzeit sortieren – ohne Termin ans Ende. Bewusst hier und nicht
  // auf die Reihenfolge der API vertrauend: die Anzeige „nächstes Spiel" bzw.
  // „letztes Ergebnis" darf nicht davon abhängen, wie der Verband liefert.
  const byKickoff = (direction) => (a, b) => {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return direction * (new Date(a.startsAt) - new Date(b.startsAt));
  };

  const isSplit = mode === 'split';

  // Laufende Spiele stehen immer ganz oben – wer die App am Spieltag öffnet,
  // sucht genau das.
  const live = games.filter((game) => game.state === 'live');
  // Kommende Spiele: das nächste zuerst.
  const upcoming = games
    .filter((game) => game.state === 'upcoming' || game.state === 'cancelled')
    .sort(byKickoff(1));
  // Beendete Spiele: das jüngste Ergebnis zuerst.
  const past = games.filter((game) => game.state === 'finished').sort(byKickoff(-1));

  // Kompletter Spielplan in Anwurfreihenfolge – so hängt er auch in der Halle.
  const all = [...games].sort(byKickoff(1));

  const showLive = isSplit && live.length > 0;
  const showUpcoming = (isSplit || mode === 'upcoming') && upcoming.length > 0;
  const showPast = (isSplit || mode === 'past') && past.length > 0;
  const showAll = mode === 'all' && all.length > 0;

  const visibleUpcoming = isSplit ? upcoming.slice(0, upcomingLimit) : upcoming;
  const visiblePast = isSplit ? past.slice(0, pastLimit) : past;

  const sourceNote = describeSource(meta);

  const renderList = (list) => (
    <ul className="list-panel mt-3">
      {list.map((game) => (
        <GameRow
          key={game.id ?? `${game.startsAt}-${game.home.name}`}
          game={game}
          ownTeamId={teamId}
          onSelectGame={onSelectGame}
        />
      ))}
    </ul>
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {meta?.stale && <Badge variant="pending">Nicht aktuell</Badge>}
      </div>

      {error && (
        <div role="alert" className="alert alert-error mt-3">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-ink-muted">Spielplan wird geladen …</p>
      ) : games.length === 0 ? (
        <p className="card-note mt-3">
          {meta?.available === false
            ? 'Der Spielplan kann gerade nicht vom Verband geladen werden. Die Termine hängen wie gewohnt in der Halle aus.'
            : 'Für diese Mannschaft sind noch keine Spiele angesetzt.'}
        </p>
      ) : (
        <>
          {showLive && (
            <div className="mt-4">
              <p className="eyebrow">Läuft gerade</p>
              {renderList(live)}
            </div>
          )}

          {showUpcoming && (
            <div className="mt-5">
              <p className="eyebrow">Nächste Spiele</p>
              {renderList(visibleUpcoming)}
            </div>
          )}

          {showPast && (
            <div className="mt-5">
              <p className="eyebrow">Letzte Ergebnisse</p>
              {renderList(visiblePast)}
            </div>
          )}

          {showAll && (
            <div className="mt-4">
              <p className="eyebrow">Alle Spiele</p>
              {renderList(all)}
            </div>
          )}

          {/* Umgeschaltet, aber in dieser Kategorie gibt es nichts. */}
          {!showLive && !showUpcoming && !showPast && !showAll && (
            <p className="card-note mt-3">
              {mode === 'past'
                ? 'Für diese Mannschaft liegen noch keine Ergebnisse vor.'
                : 'Für diese Mannschaft sind aktuell keine Spiele angesetzt.'}
            </p>
          )}
        </>
      )}

      {sourceNote && <p className="field-hint mt-3">{sourceNote}</p>}
    </section>
  );
}
