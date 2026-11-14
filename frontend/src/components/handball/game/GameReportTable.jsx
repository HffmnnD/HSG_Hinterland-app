import { useState } from 'react';

import CardMark from './CardMark';
import { TEAM_COLOR_CLASS, formatPenalties } from '../../../lib/handball';

/** Zahl oder ein ruhiger Gedankenstrich (0 soll die Tabelle nicht füllen). */
function Num({ value, strong = false }) {
  if (!value) return <span className="text-ink-muted">–</span>;
  return <span className={strong ? 'font-bold text-ink' : 'text-ink'}>{value}</span>;
}

/** 7m-Zelle: „5/7" (verwandelt/Versuche) – schmal genug fürs Handy. */
function PenaltyCell({ goals, attempts }) {
  const text = formatPenalties(goals, attempts);
  return text ? (
    <span className="whitespace-nowrap text-ink" title={text}>
      {goals}/{attempts}
    </span>
  ) : (
    <span className="text-ink-muted">–</span>
  );
}

const TH = 'px-1 pb-1.5 font-semibold sm:px-1.5';
const TD = 'px-1 py-1.5 text-center tabular-nums sm:px-1.5';

/**
 * Feste Spaltenbreiten: Die Tabelle passt so auch auf ein Handy, ohne die
 * Seite seitlich aufzuziehen. Nur die Namensspalte nimmt den Rest.
 */
function StatCols({ officials = false }) {
  return (
    <colgroup>
      <col className="w-7" />
      <col />
      {!officials && <col className="w-9" />}
      {!officials && <col className="w-10" />}
      <col className="w-7" />
      <col className="w-5" />
      <col className="w-5" />
      <col className="w-5" />
    </colgroup>
  );
}

/** Kopfzeile mit eindeutigen Spaltennamen (Karten als kleine Kartenform). */
function StatHeader({ first }) {
  return (
    <tr className="font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted">
      <th scope="col" className={`${TH} w-8 text-left`}>{first}</th>
      <th scope="col" className={`${TH} text-left`}>Name</th>
      <th scope="col" className={TH}>Tore</th>
      <th scope="col" className={TH} title="7-Meter: verwandelt/Versuche">
        7m
      </th>
      <th scope="col" className={TH} title="Zeitstrafen">2′</th>
      <th scope="col" className={TH}>
        <CardMark color="yellow" />
        <span className="sr-only">Gelbe Karten</span>
      </th>
      <th scope="col" className={TH}>
        <CardMark color="red" />
        <span className="sr-only">Rote Karten</span>
      </th>
      <th scope="col" className={TH}>
        <CardMark color="blue" />
        <span className="sr-only">Blaue Karten</span>
      </th>
    </tr>
  );
}

/** Kader + Offizielle + Summen einer Mannschaft. */
function TeamTable({ name, team, side }) {
  const { players, officials, totals } = team;
  const notes = [
    totals.teamPenalties ? `inkl. ${totals.teamPenalties} Mannschaftsstrafe${totals.teamPenalties > 1 ? 'n' : ''}` : null,
    totals.ownGoalsFor ? `${totals.ownGoalsFor} Eigentor${totals.ownGoalsFor > 1 ? 'e' : ''} des Gegners` : null,
    totals.unassignedGoals ? `${totals.unassignedGoals} Tor${totals.unassignedGoals > 1 ? 'e' : ''} ohne Zuordnung` : null,
    totals.timeouts ? `${totals.timeouts} Auszeit${totals.timeouts > 1 ? 'en' : ''}` : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-3 sm:p-4">
      <h3 className="flex items-center gap-2 font-display text-base font-bold uppercase leading-tight tracking-[0.02em] text-ink">
        <span className={`inline-block h-3 w-3 shrink-0 rounded-[2px] ${TEAM_COLOR_CLASS[side]}`} aria-hidden="true" />
        <span className="min-w-0 break-words">{name}</span>
      </h3>

      {/* Feste Spaltenbreiten – passt aufs Handy; scrollt nur im Notfall. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed text-[13px] sm:text-sm">
          <StatCols />
          <thead>
            <StatHeader first="Nr." />
          </thead>
          <tbody className="divide-y divide-line">
            {players.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-2 text-xs text-ink-muted">Kein Spielkader gemeldet.</td>
              </tr>
            ) : (
              players.map((p) => (
                <tr key={p.key}>
                  <td className="px-1 py-1.5 font-display font-bold tabular-nums text-ink-muted sm:px-1.5">{p.number ?? '—'}</td>
                  <td className="truncate px-1 py-1.5 text-ink sm:px-1.5" title={p.name}>
                    <span className={p.goals > 0 ? 'font-bold' : ''}>{p.name}</span>
                    {p.goalkeeper && <span className="tag ml-1.5">TW</span>}
                  </td>
                  <td className={TD}><Num value={p.goals} strong /></td>
                  <td className={TD}><PenaltyCell goals={p.penaltyGoals} attempts={p.penaltyAttempts} /></td>
                  <td className={TD}><Num value={p.suspensions} /></td>
                  <td className={TD}><Num value={p.yellow} /></td>
                  <td className={TD}><Num value={p.red} /></td>
                  <td className={TD}><Num value={p.blue} /></td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong font-display font-bold">
              <td className="px-1.5 py-2" />
              <td className="truncate px-1 py-2 uppercase tracking-[0.06em] text-ink sm:px-1.5">Gesamt</td>
              <td className={`${TD} text-ink`}>{totals.goals}</td>
              <td className={TD}><PenaltyCell goals={totals.penaltyGoals} attempts={totals.penaltyAttempts} /></td>
              <td className={TD}><Num value={totals.suspensions} /></td>
              <td className={TD}><Num value={totals.yellow} /></td>
              <td className={TD}><Num value={totals.red} /></td>
              <td className={TD}><Num value={totals.blue} /></td>
            </tr>
          </tfoot>
        </table>

        {officials.length > 0 && (
          <table className="mt-4 w-full table-fixed text-[13px] sm:text-sm">
            <StatCols officials />
            <thead>
              <tr className="font-display text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                <th scope="col" className={`${TH} w-8 text-left`}>Off.</th>
                <th scope="col" className={`${TH} text-left`}>Name</th>
                <th scope="col" className={TH} title="Zeitstrafen">2′</th>
                <th scope="col" className={TH}>
                  <CardMark color="yellow" />
                  <span className="sr-only">Gelbe Karten</span>
                </th>
                <th scope="col" className={TH}>
                  <CardMark color="red" />
                  <span className="sr-only">Rote Karten</span>
                </th>
                <th scope="col" className={TH}>
                  <CardMark color="blue" />
                  <span className="sr-only">Blaue Karten</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {officials.map((o) => (
                <tr key={o.key}>
                  <td className="px-1.5 py-1.5 font-display font-bold text-ink-muted">{o.role ?? '·'}</td>
                  <td className="truncate px-1 py-1.5 text-ink-soft sm:px-1.5" title={o.name}>{o.name}</td>
                  <td className={TD}><Num value={o.suspensions} /></td>
                  <td className={TD}><Num value={o.yellow} /></td>
                  <td className={TD}><Num value={o.red} /></td>
                  <td className={TD}><Num value={o.blue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notes.length > 0 && <p className="mt-2 text-xs text-ink-muted">{notes.join(' · ')}</p>}
    </div>
  );
}

/**
 * Spielübersicht: Halbzeit- und Endstand, darunter für beide Mannschaften
 * der komplette Kader (auch ohne Tor) mit Toren, 7m (verwandelt/Versuche),
 * Zeitstrafen und Karten, die Offiziellen und eine Summenzeile.
 *
 * Handy: Umschalter zwischen den Mannschaften. Desktop: nebeneinander.
 *
 * @param {{ summary: object, crew?: object|null, state: string,
 *           homeName: string, awayName: string }} props
 */
export default function GameReportTable({ summary, crew = null, state, homeName, awayName }) {
  const [active, setActive] = useState('home');
  if (!summary) return null;

  const { halftime, final, halves } = summary;
  const crewLine = [
    crew?.referees?.length ? `Schiedsrichter: ${crew.referees.join(' / ')}` : null,
    crew?.timekeeper ? `Zeitnehmer: ${crew.timekeeper}` : null,
    crew?.secretary ? `Sekretär: ${crew.secretary}` : null,
  ].filter(Boolean);

  const scoreItem = (label, score) =>
    score && (
      <span>
        {label} <span className="tabular-nums text-ink">{score.home}:{score.away}</span>
      </span>
    );

  return (
    <div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 font-display text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {scoreItem('1. Halbzeit', halftime)}
        {scoreItem(state === 'finished' ? 'Endstand' : 'Stand', final)}
        {halves?.second && state === 'finished' && scoreItem('2. Halbzeit', halves.second)}
      </div>

      {/* Umschalter nur auf dem Handy */}
      <div role="tablist" aria-label="Mannschaft wählen" className="mt-3 flex gap-2 lg:hidden">
        {[
          ['home', homeName],
          ['away', awayName],
        ].map(([side, name]) => (
          <button
            key={side}
            type="button"
            role="tab"
            aria-selected={active === side}
            onClick={() => setActive(side)}
            className={`chip chip-sm min-w-0 flex-1 ${active === side ? 'chip-active' : ''}`}
          >
            <span className={`mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${TEAM_COLOR_CLASS[side]}`} aria-hidden="true" />
            <span className="truncate">{name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`min-w-0 ${active === 'home' ? '' : 'hidden lg:block'}`}>
          <TeamTable name={homeName} team={summary.home} side="home" />
        </div>
        <div className={`min-w-0 ${active === 'away' ? '' : 'hidden lg:block'}`}>
          <TeamTable name={awayName} team={summary.away} side="away" />
        </div>
      </div>

      {crewLine.length > 0 && <p className="mt-3 text-xs text-ink-muted">{crewLine.join(' · ')}</p>}
    </div>
  );
}
