import { Badge } from '../Badge';
import { useLiveTicker } from '../../hooks/useHandball';
import {
  EVENT_TONE_CLASS,
  describeEvent,
  describeSource,
  eventMeta,
  formatKickoff,
  formatScore,
  gameStatus,
  remainingTime,
} from '../../lib/handball';

/**
 * Ein Ereignis des Tickers (Tor, 2 Minuten, Karte, Auszeit …).
 *
 * @param {{ event: object, homeName: string|null, awayName: string|null }} props
 */
function TickerEvent({ event, homeName, awayName }) {
  const meta = eventMeta(event.type);
  const teamName =
    event.teamName ??
    (event.side === 'home' ? homeName : event.side === 'away' ? awayName : null);

  return (
    <li
      className={`flex gap-3 rounded-sm border px-3 py-2.5 ${EVENT_TONE_CLASS[meta.tone]}`}
      // Der Text steht optisch verteilt (Icon, Minute, Name) – für
      // Vorlesehilfen wird er hier als ein Satz zusammengefasst.
      aria-label={describeEvent(event, homeName, awayName)}
    >
      <span className="w-11 shrink-0 pt-0.5 text-right font-display text-xs font-semibold tabular-nums text-ink-muted">
        {event.clock ?? '—'}
      </span>

      <span aria-hidden="true" className="shrink-0 text-base leading-tight">
        {meta.icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          {meta.label}
          {event.player ? ` · ${event.player}` : ''}
        </span>
        {(teamName || event.text) && (
          <span className="block truncate text-xs text-ink-muted">
            {[teamName, event.type === 'other' ? event.text : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>

      {event.scoreHome !== null && event.scoreAway !== null && (
        <span className="shrink-0 self-center font-display text-sm font-bold tabular-nums text-ink">
          {event.scoreHome}:{event.scoreAway}
        </span>
      )}
    </li>
  );
}

/**
 * Live-Ticker eines Spiels.
 *
 * Fragt über `useLiveTicker` alle 10 Sekunden neu an, solange das Spiel läuft
 * und die App im Vordergrund ist (Details siehe hooks/useHandball.js).
 *
 * Zur Restzeit-Anzeige: nuLiga liefert keine mitlaufende Uhr, sondern
 * nur die Spielzeit der zuletzt gemeldeten Aktion. Die Anzeige ist deshalb
 * ausdrücklich als „Stand der letzten Aktion" beschriftet – eine sekundengenau
 * wirkende Uhr wäre an dieser Stelle schlicht gelogen.
 *
 * @param {{ gameId: string,
 *           title?: string,
 *           durationMinutes?: number,
 *           maxEvents?: number }} props
 *   `durationMinutes` für Jugendspiele anpassen (z. B. 50 bei 2 x 25).
 */
export default function LiveTickerWidget({
  gameId,
  title = 'Live-Ticker',
  durationMinutes = 60,
  maxEvents = 50,
}) {
  const { ticker, events, meta, loading, error, isPolling, refresh } =
    useLiveTicker(gameId);

  const game = ticker?.game ?? null;
  const state = ticker?.state ?? 'upcoming';
  const status = gameStatus(state);
  const isLive = state === 'live';

  const homeName = game?.home?.name ?? 'Heim';
  const awayName = game?.away?.name ?? 'Gast';

  const remaining =
    isLive && ticker
      ? remainingTime(ticker.clockSeconds, ticker.period, durationMinutes)
      : null;

  const sourceNote = describeSource(meta);
  const visibleEvents = events.slice(0, maxEvents);

  return (
    <section className={isLive ? 'card-accent' : 'card'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        <div className="flex items-center gap-2">
          {meta?.stale && <Badge variant="pending">Nicht aktuell</Badge>}
          <Badge variant={status.variant}>
            {isLive && <span className="live-dot" aria-hidden="true" />}
            {status.label}
          </Badge>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-error mt-4">
          {error}
        </div>
      )}

      {loading && !ticker ? (
        <p className="mt-4 text-sm text-ink-muted">Ticker wird geladen …</p>
      ) : (
        <>
          {/* ------------------------------------------------ Anzeigetafel */}
          <div className="mt-4 rounded-md border border-line bg-surface px-4 py-4">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-right text-sm font-bold leading-snug text-ink">
                {homeName}
              </p>
              <p
                className="shrink-0 font-display text-3xl font-bold leading-none tabular-nums text-ink"
                // Der Spielstand ändert sich während des Lesens – Vorlesehilfen
                // sollen die Änderung ansagen, aber nicht unterbrechen.
                aria-live="polite"
              >
                {formatScore(ticker?.homeGoals, ticker?.awayGoals)}
              </p>
              <p className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">
                {awayName}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              {game?.startsAt && <span>{formatKickoff(game.startsAt)}</span>}
              {ticker?.period && <span>{ticker.period}. Halbzeit</span>}
              {ticker?.clock && (
                <span className="tabular-nums">
                  Spielzeit {ticker.clock}
                  {remaining ? ` · Restzeit ${remaining}` : ''}
                </span>
              )}
            </div>

            {isLive && ticker?.clock && (
              <p className="mt-2 text-center text-[0.6875rem] leading-snug text-ink-muted">
                Zeiten sind der Stand der letzten gemeldeten Aktion, keine
                laufende Uhr.
              </p>
            )}
          </div>

          {/* ------------------------------------------------ Ereignisliste */}
          {visibleEvents.length === 0 ? (
            <p className="card-note mt-4">
              {meta?.available === false
                ? 'Der Ticker ist gerade nicht erreichbar.'
                : state === 'upcoming'
                  ? 'Das Spiel hat noch nicht begonnen. Die Ereignisse erscheinen hier automatisch, sobald angeworfen wird.'
                  : 'Für dieses Spiel wurden keine Ereignisse gemeldet.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {visibleEvents.map((event) => (
                <TickerEvent
                  key={event.id}
                  event={event}
                  homeName={homeName}
                  awayName={awayName}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="field-hint mt-0">
          {sourceNote}
          {isPolling && isLive ? ' · aktualisiert sich alle 10 Sekunden' : ''}
        </p>
        {/* Immer erreichbar: nach dem Zurückkehren aus dem Hintergrund oder
            bei stockender Verbindung will man selbst nachladen können. */}
        <button type="button" onClick={refresh} className="btn btn-sm btn-ghost">
          Aktualisieren
        </button>
      </div>
    </section>
  );
}
