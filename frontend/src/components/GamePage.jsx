import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import { apiFetch } from '../lib/api';
import AppLayout from './AppLayout';
import { Badge } from './Badge';
import { useLiveTicker } from '../hooks/useHandball';
import { describeSource } from '../lib/handball';
import GameScoreboard from './handball/game/GameScoreboard';
import GameReportTable from './handball/game/GameReportTable';
import GameTimeline from './handball/game/GameTimeline';
import LinkedMatchReports from './matchReports/LinkedMatchReports';
import { ListSkeleton } from './team/Skeleton';

/**
 * Spielseite: Live-Ticker während des Spiels, Spielbericht danach.
 *
 * Erreichbar über /teams/:code/spiele/:gameId – aus der Karte „Aktuelles
 * Spiel" auf der Mannschaftsseite und aus jeder Zeile im Spielplan.
 *
 * Inhalt (von oben): Anzeigetafel, Zusammenfassung (Torschützen, Strafen,
 * Halbzeiten), Spielverlauf, Spielkader. Während des Spiels lädt die Seite
 * im Takt nach, den der Server vorgibt (2 s, unter Last länger) – im
 * Hintergrund pausiert sie.
 */
export default function GamePage() {
  const { code, gameId } = useParams();
  const location = useLocation();
  // Teamname für die Kopfzeile: kommt beim Klick aus der Mannschaftsseite
  // mit; bei direktem Aufruf (Lesezeichen, geteilter Link) wird er geladen.
  const stateName = location.state?.teamName ?? null;
  const [loadedName, setLoadedName] = useState(null);
  useEffect(() => {
    if (stateName) return undefined;
    let cancelled = false;
    apiFetch(`/api/teams/${encodeURIComponent(code)}`)
      .then((data) => {
        if (!cancelled) setLoadedName(data?.team?.name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code, stateName]);
  const teamName = stateName ?? loadedName;
  const backTab = location.state?.fromTab ?? null;
  const backTo = `/teams/${encodeURIComponent(code)}${backTab ? `?tab=${backTab}` : ''}`;

  const { ticker, events, meta, loading, error, refresh } = useLiveTicker(gameId);

  const game = ticker?.game ?? null;
  const state = ticker?.state ?? 'upcoming';
  const homeName = game?.home?.name ?? 'Heim';
  const awayName = game?.away?.name ?? 'Gast';
  const isLive = state === 'live';
  const hasEvents = events.length > 0;
  // Spielnummer (meeting) steht vorn in der Spiel-ID: meeting.group.championship
  const meetingId = /^\d{1,12}(?=\.)/.exec(gameId ?? '')?.[0] ?? null;
  const summary = ticker?.summary ?? null;
  // Übersicht auch vor dem Anpfiff zeigen, sobald ein Kader gemeldet ist.
  const showOverview = Boolean(
    summary && (hasEvents || summary.home?.players?.length || summary.away?.players?.length)
  );

  const source =
    ticker?.live?.provider === 'nuScoreLive'
      ? 'nuScoreLive'
      : hasEvents
        ? 'nuLiga-Spielbericht'
        : null;
  const sourceNote = [describeSource(meta), source ? `Quelle: ${source}` : null]
    .filter(Boolean)
    .join(' · ');

  // Streckt der Server den Takt, sagt die Seite das ehrlich.
  const pollSeconds = ticker?.poll?.afterMs ? Math.round(ticker.poll.afterMs / 1000) : null;
  const slowed = isLive && ticker?.poll?.reason && pollSeconds > 2;

  return (
    <AppLayout
      width="max-w-4xl"
      header={
        <Link
          to={backTo}
          className="group flex min-w-0 items-center gap-1.5"
          title="Zurück zur Mannschaft"
        >
          <ChevronLeft
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ink-muted transition-colors group-hover:text-hsg-green-dark"
          />
          <span className="header-title">{teamName ?? 'Mannschaft'}</span>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">{isLive ? 'Live-Ticker' : state === 'finished' ? 'Spielbericht' : 'Vorschau'}</p>
          {game?.competition && <p className="mt-0.5 truncate text-xs text-ink-muted">{game.competition}</p>}
        </div>
        {meta?.stale && <Badge variant="pending">Nicht aktuell</Badge>}
      </div>

      {error && !ticker && (
        <div role="alert" className="alert alert-error mt-4">
          {error}
        </div>
      )}

      {loading && !ticker ? (
        <div className="mt-4">
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          <GameScoreboard ticker={ticker} />

          {error && ticker && (
            <p className="field-hint mt-0">Verbindung stockt – letzter Stand wird angezeigt.</p>
          )}

          {/* Eine Übersicht statt Zusammenfassung + Kader: kompletter Kader
              beider Teams mit Toren, 7m, Strafen, Karten und Summen. */}
          {showOverview && (
            <section aria-labelledby="game-overview">
              <h2 id="game-overview" className="section-title">Spielübersicht</h2>
              <div className="mt-3">
                <GameReportTable
                  summary={ticker.summary}
                  crew={ticker.crew}
                  state={state}
                  homeName={homeName}
                  awayName={awayName}
                />
              </div>
            </section>
          )}

          {/* Spielbericht (unter Verein → Infos geschrieben und mit diesem
              Spiel verknüpft) direkt unter der Übersicht, zugeklappt. */}
          <LinkedMatchReports meetingId={meetingId} />

          <section aria-labelledby="game-timeline">
            <h2 id="game-timeline" className="section-title">Spielverlauf</h2>
            <div className="mt-3">
              <GameTimeline
                events={events}
                homeName={homeName}
                awayName={awayName}
                startsAt={game?.startsAt ?? null}
                emptyText={
                  meta?.available === false
                    ? 'Ticker nicht erreichbar.'
                    : state === 'upcoming'
                      ? 'Noch nicht angepfiffen.'
                      : 'Für dieses Spiel liegen keine Ereignisse vor.'
                }
              />
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="field-hint mt-0">
              {sourceNote}
              {slowed ? ` · Hohe Last – aktualisiert alle ${pollSeconds} s` : ''}
            </p>
            <button type="button" onClick={refresh} className="btn btn-sm btn-ghost">
              Aktualisieren
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
