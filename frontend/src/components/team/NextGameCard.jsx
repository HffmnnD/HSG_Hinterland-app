import { formatKickoff } from '../../lib/handball';

/**
 * Das nächste Spiel der Mannschaft – die eine Information, die auf einer
 * Vereinsseite unter der Woche zählt: wann, gegen wen, wo.
 *
 * Steht im Reiter „Übersicht" auf hellem Grund (deshalb `.card-accent` und
 * nicht die dunkle Kachel aus dem Kopfbereich). Vergangene Ergebnisse gehören
 * bewusst NICHT hierher, sondern in den Reiter „Spielplan & Tabelle" – die
 * Übersicht soll auf einen Blick lesbar bleiben.
 *
 * @param {{ game: object|null, hasLeague?: boolean }} props
 *   `game` = null -> es steht kein Spiel an (Saisonende, Pause, Spielfrei).
 */
export default function NextGameCard({ game, hasLeague = true }) {
  if (!game) {
    return (
      <section className="card">
        <p className="eyebrow">Nächstes Spiel</p>
        <p className="mt-2 text-sm text-ink-soft">
          {hasLeague
            ? 'Aktuell ist kein weiteres Spiel angesetzt.'
            : 'Für diese Mannschaft sind noch keine Spiele terminiert.'}
        </p>
      </section>
    );
  }

  // „gegen" oder „bei" – macht ohne Nachdenken klar, ob Heim- oder
  // Auswärtsspiel ansteht.
  const opponent = game.opponent?.name ?? game.away?.name ?? null;
  const preposition = game.isHome === false ? 'bei' : 'gegen';

  const details = [game.venue?.name, game.competition].filter(Boolean);

  return (
    <section className="card-accent">
      <p className="eyebrow">Nächstes Spiel</p>

      <p className="mt-1.5 font-display text-xl font-bold uppercase leading-tight tracking-[0.02em] text-ink sm:text-2xl">
        {formatKickoff(game.startsAt)}
      </p>

      {opponent && (
        <p className="mt-2 text-sm text-ink-soft">
          <span className="text-ink-muted">{preposition} </span>
          <span className="font-bold text-ink">{opponent}</span>
          {game.isHome !== null && (
            <span className="tag ml-2">
              {game.isHome ? 'Heimspiel' : 'Auswärtsspiel'}
            </span>
          )}
        </p>
      )}

      {details.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">{details.join(' · ')}</p>
      )}
    </section>
  );
}
