import { Badge } from '../Badge';
import { useLiveTicker } from '../../hooks/useHandball';
import { describeSource } from '../../lib/handball';
import GameScoreboard from './game/GameScoreboard';
import GameTimeline from './game/GameTimeline';

/**
 * Kompakter Live-Ticker eines Spiels (Anzeigetafel + letzte Aktionen).
 *
 * Die ausführliche Ansicht mit Zusammenfassung und Spielkader ist die
 * Spielseite (components/GamePage.jsx); dieses Widget ist für Stellen
 * gedacht, an denen nur Stand und Verlauf Platz haben. Nachgeladen wird im
 * Takt, den der Server vorgibt (2 s live), siehe hooks/useHandball.js.
 *
 * @param {{ gameId: string, title?: string, maxEvents?: number }} props
 */
export default function LiveTickerWidget({ gameId, title = 'Live-Ticker', maxEvents = 15 }) {
  const { ticker, events, meta, loading, error, refresh } = useLiveTicker(gameId);

  const game = ticker?.game ?? null;
  const state = ticker?.state ?? 'upcoming';
  const isLive = state === 'live';
  const sourceNote = describeSource(meta);

  return (
    <section className={isLive ? 'card-accent' : 'card'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {meta?.stale && <Badge variant="pending">Nicht aktuell</Badge>}
      </div>

      {error && !ticker && (
        <div role="alert" className="alert alert-error mt-4">
          {error}
        </div>
      )}

      {loading && !ticker ? (
        <p className="mt-4 text-sm text-ink-muted">Ticker wird geladen …</p>
      ) : (
        <>
          <div className="mt-4">
            <GameScoreboard ticker={ticker} compact />
          </div>
          <div className="mt-4">
            <GameTimeline
              events={events}
              homeName={game?.home?.name ?? 'Heim'}
              awayName={game?.away?.name ?? 'Gast'}
              maxEvents={maxEvents}
              filterable={false}
              emptyText={
                meta?.available === false
                  ? 'Ticker nicht erreichbar.'
                  : state === 'upcoming'
                    ? 'Noch nicht angepfiffen.'
                    : 'Keine Ereignisse.'
              }
            />
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="field-hint mt-0">{sourceNote}</p>
        <button type="button" onClick={refresh} className="btn btn-sm btn-ghost">
          Aktualisieren
        </button>
      </div>
    </section>
  );
}
