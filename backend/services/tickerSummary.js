// Spielübersicht eines Spiels: kompletter Kader beider Mannschaften mit
// Statistik je Person, Offizielle, Summenzeile, Halbzeit- und Endstand.
//
// Arbeitet auf dem fertigen Ticker-DTO (Ereignisse) plus – wenn vorhanden –
// dem Kader aus nuScoreLive. So liefern nuScoreLive (live) und der
// nuLiga-Spielbericht (nach dem Spiel) dieselbe Übersicht: ein Code, zwei
// Quellen. Gezählt wird IMMER aus den Ereignissen; der Kader liefert nur die
// Liste der Personen (auch die ohne Tor) und die Trikotnummern.
//
// Ergebnis:
//   {
//     halftime: { home, away } | null,
//     final:    { home, away } | null,     // Endstand ODER aktueller Stand
//     halves:   { first, second },          // Tore je Halbzeit
//     home: {
//       players:   [{ key, number, name, goalkeeper, goals, penaltyGoals,
//                     penaltyAttempts, suspensions, yellow, red, blue }],
//       officials: [{ key, role, name, suspensions, yellow, red, blue }],
//       totals:    { goals, penaltyGoals, penaltyAttempts, suspensions,
//                    yellow, red, blue, timeouts, teamPenalties, ownGoalsFor,
//                    unassignedGoals },
//     },
//     away: { … },
//   }

const STAT_KEYS = ['goals', 'penaltyGoals', 'penaltyAttempts', 'suspensions', 'yellow', 'red', 'blue'];

const emptyStats = () => Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));

const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Welche Statistik zählt ein Ereignis hoch? */
function applyEvent(stats, type) {
  if (type === 'goal') stats.goals += 1;
  else if (type === 'penaltyGoal') {
    stats.goals += 1;
    stats.penaltyGoals += 1;
    stats.penaltyAttempts += 1;
  } else if (type === 'penaltyMissed') stats.penaltyAttempts += 1;
  else if (type === 'suspension') stats.suspensions += 1;
  else if (type === 'yellowCard') stats.yellow += 1;
  else if (type === 'redCard') stats.red += 1;
  else if (type === 'blueCard') stats.blue += 1;
  else return false;
  return true;
}

/**
 * Personenverzeichnis einer Mannschaft. Personen werden über die
 * nuScoreLive-Personen-ID gefunden, sonst über Nummer bzw. Namen (nuLiga-
 * Spielbericht kennt keine IDs).
 */
function teamRoster(lineupTeam) {
  const players = (lineupTeam?.players ?? []).map((p) => ({
    key: p.id ?? `${p.number ?? ''}|${p.name}`,
    number: p.number ?? null,
    name: p.name ?? null,
    goalkeeper: Boolean(p.goalkeeper),
    ...emptyStats(),
  }));
  const officials = (lineupTeam?.officials ?? []).map((o) => ({
    key: o.id ?? `${o.role ?? ''}|${o.name}`,
    role: o.role ?? null,
    name: o.name ?? null,
    suspensions: 0,
    yellow: 0,
    red: 0,
    blue: 0,
  }));

  const byId = new Map();
  const byNumber = new Map();
  const byName = new Map();
  for (const person of [...players, ...officials]) {
    byId.set(person.key, person);
    if (person.number) byNumber.set(String(person.number), person);
    if (person.name) byName.set(norm(person.name), person);
  }

  /** Person zu einem Ereignis finden – oder (Spieler ohne Kader) neu anlegen. */
  function find(event) {
    if (event.personId && byId.has(event.personId)) return byId.get(event.personId);
    if (event.playerNumber && byNumber.has(String(event.playerNumber))) {
      return byNumber.get(String(event.playerNumber));
    }
    if (event.player && byName.has(norm(event.player))) return byName.get(norm(event.player));
    if (!event.player) return null;

    // Nicht im Kader (z. B. nuLiga-Bericht ohne nuScoreLive): als Spieler:in
    // aufnehmen, damit sie in der Übersicht erscheint.
    const person = {
      key: event.personId ?? `${event.playerNumber ?? ''}|${event.player}`,
      number: event.playerNumber ?? null,
      name: event.player,
      goalkeeper: false,
      ...emptyStats(),
    };
    players.push(person);
    byId.set(person.key, person);
    if (person.number) byNumber.set(String(person.number), person);
    byName.set(norm(person.name), person);
    return person;
  }

  return { players, officials, find };
}

const byJersey = (a, b) => {
  const na = Number.parseInt(a.number, 10);
  const nb = Number.parseInt(b.number, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
  return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'de');
};

/**
 * @param {object} ticker Ticker-DTO (events, game, homeGoals, awayGoals)
 * @param {object|null} lineup Kader aus nuScoreLive (mapLineup) oder null
 */
function buildSummary(ticker, lineup = null) {
  const rosters = {
    home: teamRoster(lineup?.home),
    away: teamRoster(lineup?.away),
  };
  const totals = {
    home: { ...emptyStats(), timeouts: 0, teamPenalties: 0, ownGoalsFor: 0, unassignedGoals: 0 },
    away: { ...emptyStats(), timeouts: 0, teamPenalties: 0, ownGoalsFor: 0, unassignedGoals: 0 },
  };
  const other = { home: 'away', away: 'home' };

  for (const event of ticker.events ?? []) {
    const side = event.side === 'home' || event.side === 'away' ? event.side : null;
    if (!side) continue;

    if (event.type === 'timeout') {
      totals[side].timeouts += 1;
      continue;
    }
    if (event.type === 'ownGoal') {
      // Eigentor zählt für den Gegner, aber für niemanden als Torschütze.
      totals[other[side]].goals += 1;
      totals[other[side]].ownGoalsFor += 1;
      continue;
    }

    const team = totals[side];
    if (!applyEvent(team, event.type)) continue;

    const person = rosters[side].find(event);
    if (person) {
      // Offizielle haben keine Torstatistik – nur Strafen/Karten zählen.
      if ('role' in person) {
        if (!['goal', 'penaltyGoal', 'penaltyMissed'].includes(event.type)) {
          applyEvent(person, event.type);
        }
      } else {
        applyEvent(person, event.type);
      }
    } else if (event.type === 'goal' || event.type === 'penaltyGoal') {
      team.unassignedGoals += 1;
    } else if (event.type === 'suspension') {
      // Zeitstrafe ohne Person = Mannschaftsstrafe (z. B. Wechselfehler).
      team.teamPenalties += 1;
    }
  }

  for (const side of ['home', 'away']) rosters[side].players.sort(byJersey);

  const game = ticker.game ?? {};
  const isInt = Number.isInteger;
  const halftime =
    isInt(game.homeGoalsHalftime) && isInt(game.awayGoalsHalftime)
      ? { home: game.homeGoalsHalftime, away: game.awayGoalsHalftime }
      : null;
  const final =
    isInt(ticker.homeGoals) && isInt(ticker.awayGoals)
      ? { home: ticker.homeGoals, away: ticker.awayGoals }
      : null;
  const second =
    halftime && final
      ? { home: Math.max(0, final.home - halftime.home), away: Math.max(0, final.away - halftime.away) }
      : null;

  return {
    halftime,
    final,
    halves: { first: halftime, second },
    home: { players: rosters.home.players, officials: rosters.home.officials, totals: totals.home },
    away: { players: rosters.away.players, officials: rosters.away.officials, totals: totals.away },
  };
}

module.exports = { buildSummary };
