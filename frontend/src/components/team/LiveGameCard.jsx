import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { useLiveTicker } from '../../hooks/useHandball';
import { eventMeta, formatPlayer, formatScore } from '../../lib/handball';

/**
 * „Aktuelles Spiel" – ersetzt im Reiter „Übersicht" die Karte „Nächstes
 * Spiel", solange die Mannschaft spielt. Zeigt Live-Stand, Gegner und die
 * letzte Aktion; ein Klick öffnet den kompletten Live-Ticker.
 *
 * Der Stand kommt aus dem Ticker (2-Sekunden-Takt), nicht aus dem Spielplan –
 * der wird nur alle paar Minuten neu geholt.
 *
 * @param {{ game: object, to: string|null, linkState?: object }} props
 *   `game` = Spiel aus dem Spielplan, `to` = Adresse der Spielseite
 *   (null, solange es noch keine Spiel-ID gibt).
 */
export default function LiveGameCard({ game, to, linkState }) {
  const { ticker } = useLiveTicker(game.id ?? null);

  const state = ticker?.state ?? game.state;
  const isLive = state === 'live';
  const homeGoals = ticker ? ticker.homeGoals : game.homeGoals;
  const awayGoals = ticker ? ticker.awayGoals : game.awayGoals;
  const homeName = ticker?.game?.home?.name ?? game.home?.name ?? 'Heim';
  const awayName = ticker?.game?.away?.name ?? game.away?.name ?? 'Gast';

  const opponent = game.opponent?.name ?? null;
  const preposition = game.isHome === false ? 'bei' : 'gegen';

  // Letzte echte Aktion (Trenner wie „Halbzeit" zählen nicht).
  const last = (ticker?.events ?? []).find((event) => !eventMeta(event.type).marker) ?? null;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Aktuelles Spiel</p>
        {isLive ? (
          <span className="badge badge-live">
            <span className="live-dot" aria-hidden="true" />
            Live{ticker?.clock ? ` · ${ticker.clock}` : ''}
          </span>
        ) : state === 'finished' ? (
          <span className="badge badge-confirmed">Endstand</span>
        ) : (
          <span className="badge badge-neutral">Gleich geht’s los</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <p className="min-w-0 break-words text-sm font-bold leading-snug text-ink">{homeName}</p>
        <p className="font-display text-4xl font-bold leading-none tabular-nums text-ink" aria-live="polite">
          {formatScore(homeGoals, awayGoals)}
        </p>
        <p className="min-w-0 break-words text-right text-sm font-bold leading-snug text-ink">{awayName}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="min-w-0 truncate">
          {last ? (
            <>
              <span className="font-display font-semibold tabular-nums text-ink-soft">{last.clock}</span>{' '}
              <span className="font-display font-semibold uppercase tracking-[0.08em]">
                {eventMeta(last.type).short}
              </span>
              {last.player
                ? ` · ${formatPlayer(last.player, last.playerNumber)}`
                : last.side
                  ? ` · ${last.side === 'home' ? homeName : awayName}`
                  : ''}
            </>
          ) : opponent ? (
            <>
              {preposition} <span className="font-bold text-ink-soft">{opponent}</span>
            </>
          ) : null}
        </span>
        {to ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 font-display font-semibold uppercase tracking-[0.08em] text-hsg-green-dark">
            Zum Live-Ticker
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        ) : (
          <span className="shrink-0">Ticker folgt mit der ersten Aktion</span>
        )}
      </div>
    </>
  );

  return to ? (
    <Link
      to={to}
      state={linkState}
      className="card-accent block transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hsg-green"
    >
      {content}
    </Link>
  ) : (
    <section className="card-accent">{content}</section>
  );
}
