import { TEAM_COLOR_CLASS, breakable, formatKickoff, formatScore } from '../../../lib/handball';

/**
 * Anzeigetafel eines Spiels: beide Mannschaften, großer Spielstand,
 * Halbzeitstand und der Zustand (Spielminute / Endstand / Anwurf).
 *
 * @param {{ ticker: object|null, compact?: boolean }} props
 */
export default function GameScoreboard({ ticker, compact = false }) {
  const game = ticker?.game ?? null;
  const state = ticker?.state ?? 'upcoming';
  const homeName = game?.home?.name ?? 'Heim';
  const awayName = game?.away?.name ?? 'Gast';

  const hasHalf =
    game?.homeGoalsHalftime !== null &&
    game?.homeGoalsHalftime !== undefined &&
    game?.awayGoalsHalftime !== null &&
    game?.awayGoalsHalftime !== undefined;

  let stateLine;
  if (state === 'live') {
    stateLine = (
      <span className="badge badge-live">
        <span className="live-dot" aria-hidden="true" />
        Live{ticker?.clock ? ` · ${ticker.clock}` : ''}
        {ticker?.period ? ` · ${ticker.period}. HZ` : ''}
      </span>
    );
  } else if (state === 'finished') {
    stateLine = <span className="badge badge-confirmed">Endstand</span>;
  } else if (state === 'cancelled') {
    stateLine = <span className="badge badge-pending">Abgesagt</span>;
  } else {
    stateLine = <span className="badge badge-neutral">Anwurf {formatKickoff(game?.startsAt)}</span>;
  }

  const teamClass = compact
    ? 'text-sm font-bold leading-snug text-ink'
    : 'font-display text-[13px] font-bold uppercase leading-tight tracking-[0.02em] text-ink sm:text-lg';

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-4 sm:px-5 sm:py-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${TEAM_COLOR_CLASS.home}`} aria-hidden="true" />
            Heim
          </p>
          <p className={`mt-0.5 break-words ${teamClass}`}>{breakable(homeName)}</p>
        </div>

        <p
          className={`text-center font-display font-bold leading-none tabular-nums text-ink ${
            compact ? 'text-3xl' : 'text-4xl sm:text-6xl'
          }`}
          // Der Spielstand ändert sich während des Lesens – Vorlesehilfen
          // sollen die Änderung ansagen, aber nicht unterbrechen.
          aria-live="polite"
        >
          {formatScore(ticker?.homeGoals, ticker?.awayGoals)}
        </p>

        <div className="min-w-0 text-right">
          <p className="eyebrow flex items-center justify-end gap-1.5">
            Gast
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${TEAM_COLOR_CLASS.away}`} aria-hidden="true" />
          </p>
          <p className={`mt-0.5 break-words ${teamClass}`}>{breakable(awayName)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
        {stateLine}
        {hasHalf && (
          <span className="font-display font-semibold uppercase tracking-wider tabular-nums">
            1. Halbzeit {game.homeGoalsHalftime}:{game.awayGoalsHalftime}
          </span>
        )}
        {state !== 'upcoming' && game?.startsAt && !compact && (
          <span>{formatKickoff(game.startsAt)}</span>
        )}
        {game?.venue?.name && !compact && <span>{game.venue.name}</span>}
      </div>
    </div>
  );
}
