// Übersetzt die HTML-Seiten von nuLiga (HHV) in stabile App-DTOs.
//
// Die DTO-Struktur ist unverändert gegenüber der früheren handball.net-
// Anbindung – das Frontend (TableWidget, ScheduleWidget, LiveTickerWidget)
// bekommt exakt dieselben Felder und musste nicht angefasst werden.
//
// Warum das Auslesen so umständlich aussieht:
// nuLiga liefert reines HTML ohne stabile IDs oder Klassen an den Zellen.
// Feste Spaltennummern wären hier ein Fehler – dieselbe Spalte enthält je
// nach Spielstatus das ERGEBNIS (gespielt) oder die SCHIEDSRICHTER (noch
// nicht gespielt). Deshalb gilt durchgängig:
//
//   * Spalten werden über ihre Überschrift gefunden ("Datum", "Heimmannschaft",
//     "Punkte" …), nicht über ihren Index.
//   * Werte, die keine eigene Überschrift haben (Ergebnis, Spiel-ID), werden
//     am Inhalt erkannt: "34:32" bzw. ein Link mit `meeting=`.
//   * Leere Datumszellen werden fortgeschrieben – nuLiga schreibt das Datum
//     nur in die erste Zeile eines Spieltags.
//   * Auf FELD-Ebene nie werfen: Unbekanntes wird zu null bzw. zu einer leeren
//     Liste. Auf SEITEN-Ebene dagegen sehr wohl: Fehlt die erwartete Tabelle
//     komplett, wirft der Mapper einen HandballStructureError.
//
// Warum diese Unterscheidung wichtig ist: nuLiga antwortet bei Wartung oder
// Sperre mit HTTP 200 und einer gestalteten Seite. Ohne den Strukturfehler
// hielte der Service so eine Seite für ein gültiges Ergebnis, würde sie
// cachen UND die Notreserve mit leeren Daten überschreiben – der Spielstand
// verschwände mitten im Spiel. Ein Strukturfehler dagegen läuft in dieselbe
// Behandlung wie ein Netzwerkfehler: letzter guter Stand bleibt stehen.
const {
  HALFTIME_MINUTES,
  LIVE_WINDOW_MINUTES,
  encodeGameId,
} = require('../config/handball');

/**
 * Die abgerufene Seite sieht nicht aus wie das, was wir auslesen: die
 * erwartete Tabelle fehlt vollständig. Ursachen sind in der Praxis eine
 * Wartungs-/Sperrseite mit HTTP 200 oder ein Umbau bei nuLiga.
 *
 * Wird vom Service wie ein Upstream-Fehler behandelt (Notreserve statt leerer
 * Daten). Bewusst NICHT für „Tabelle gefunden, aber ohne Zeilen" – eine
 * Mannschaft ohne angesetzte Spiele ist ein gültiger Zustand.
 */
class HandballStructureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HandballStructureError';
  }
}

// ---------------------------------------------------------------- Helfer ---

/** Text einer Zelle: Whitespace normalisiert, geschützte Leerzeichen raus. */
function cellText($, el) {
  return $(el)
    .text()
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Getrimmte Zeichenkette oder null (Leerstrings gelten als „nicht da"). */
function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** Zahl oder null. Akzeptiert "12", " 12 ", "+137". */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace('+', '').trim());
  return Number.isFinite(num) ? num : null;
}

/** Alle Zeilen einer Tabelle als Array von Zell-Arrays. */
function rowsOf($, table) {
  return $(table)
    .find('tr')
    .map((i, tr) => ({
      el: tr,
      cells: $(tr)
        .children('td, th')
        .map((j, td) => cellText($, td))
        .get(),
    }))
    .get();
}

/**
 * Sucht die Tabelle, deren Kopfzeile ALLE gesuchten Überschriften enthält.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string[]} required Überschriften (Kleinschreibung, Teilstring-Match)
 * @returns {{ table: any, header: string[] }|null}
 */
function findTableByHeader($, required) {
  let found = null;

  $('table').each((i, table) => {
    if (found) return;
    const first = $(table).find('tr').first();
    const header = first
      .children('td, th')
      .map((j, c) => cellText($, c).toLowerCase())
      .get();

    const complete = required.every((needle) =>
      header.some((cell) => cell.includes(needle))
    );
    if (complete) found = { table, header };
  });

  return found;
}

/**
 * Index der Spalte zu einer Überschrift.
 *
 * Erst exakt, dann als Teilstring – und Teilstring NUR für mehrbuchstabige
 * Kandidaten. Grund: nuLiga kürzt Siege/Unentschieden/Niederlagen auf "S",
 * "U", "N" ab. Ein Teilstring-Treffer würde "S" in "Mannschaft", "U" in
 * "Begegnungen" und "N" in "Rang" finden – die Tabelle stünde dann mit
 * völlig falschen Zahlen in der App.
 *
 * @returns {number} -1, wenn keine Spalte passt
 */
function columnIndex(header, ...candidates) {
  for (const candidate of candidates) {
    const index = header.findIndex((cell) => cell === candidate);
    if (index !== -1) return index;
  }
  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    const index = header.findIndex((cell) => cell.includes(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

// „34:32", "0:1", "758:621" – Ergebnis, Spielstand oder Torverhältnis.
const SCORE_PATTERN = /^(\d{1,3})\s*:\s*(\d{1,3})$/;

/** "34:32" -> { home: 34, away: 32 }; sonst null. */
function parseScore(value) {
  const match = SCORE_PATTERN.exec(String(value ?? '').trim());
  return match ? { home: Number(match[1]), away: Number(match[2]) } : null;
}

// ------------------------------------------------------------ Zeitzonen ----

/**
 * Verschiebung einer Zeitzone zu UTC an einem konkreten Zeitpunkt (in ms).
 * Nötig, weil nuLiga lokale deutsche Zeiten ohne Zonenangabe liefert.
 */
function timeZoneOffsetMs(timestamp, timeZone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    format.formatToParts(timestamp).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - timestamp;
}

/**
 * "09.05.2026" + "17:00" -> ISO-Zeitstempel in UTC.
 *
 * Bewusst NICHT `new Date('2026-05-09T17:00')`: das würde die Zeitzone des
 * Servers verwenden. Läuft das Backend irgendwann in einer Cloud auf UTC,
 * stünde jeder Anwurf ein bis zwei Stunden falsch in der App – bei einem
 * Spielplan der schlimmste denkbare Fehler.
 *
 * @param {string|null} dateText "TT.MM.JJJJ"
 * @param {string|null} timeText "HH:MM" (optional)
 * @param {string} timeZone
 * @returns {string|null}
 */
function toIsoDateTime(dateText, timeText, timeZone = 'Europe/Berlin') {
  // Bewusst NICHT auf den Zellenanfang/-ende verankert: nuLiga hängt an
  // verlegte Spiele einen Marker an ("19:00 t"). Mit einem verankerten Muster
  // fiele die Uhrzeit weg und der Anwurf stünde als 00:00 Uhr in der App.
  const date = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(dateText ?? ''));
  if (!date) return null;

  const time = /(\d{1,2}):(\d{2})/.exec(String(timeText ?? ''));
  const [, day, month, year] = date;
  const hours = time ? Number(time[1]) : 0;
  const minutes = time ? Number(time[2]) : 0;

  const naive = Date.UTC(Number(year), Number(month) - 1, Number(day), hours, minutes);
  // Zwei Durchläufe: der zweite fängt die Zeitumstellung sauber ab.
  let timestamp = naive - timeZoneOffsetMs(naive, timeZone);
  timestamp = naive - timeZoneOffsetMs(timestamp, timeZone);

  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** "00:48" oder "56:16" -> Sekunden seit Spielbeginn. */
function clockToSeconds(value) {
  const match = /^(\d{1,3}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// ----------------------------------------------------------- Mannschaften --

/** Mannschaft aus Name (+ optionalem teamtable-Link) -> DTO. */
function makeTeam(name, id = null) {
  return {
    id: toText(id),
    name: toText(name),
    // nuLiga zeigt in Tabelle und Spielplan keine Wappen. Feld bleibt für
    // Formatgleichheit erhalten, das Frontend blendet es bei null aus.
    logoUrl: null,
  };
}

/** `teamtable`-ID aus einem nuLiga-Link ziehen. */
function teamIdFromHref(href) {
  const match = /[?&]teamtable=(\d+)/.exec(href ?? '');
  return match ? match[1] : null;
}

/** meeting/championship/group aus einem Spielbericht-Link ziehen. */
function meetingPartsFromHref(href) {
  if (!href) return null;
  const meeting = /[?&]meeting=(\d+)/.exec(href)?.[1];
  const group = /[?&]group=(\d+)/.exec(href)?.[1];
  const championship = /[?&]championship=([^&]+)/.exec(href)?.[1];
  if (!meeting || !group || !championship) return null;
  return {
    meeting,
    group,
    championship: decodeURIComponent(championship.replace(/\+/g, ' ')),
  };
}

// ------------------------------------------------------- Staffel-Kontext ---

/**
 * Liest aus einer Mannschafts- oder Staffelseite, zu welcher Staffel sie
 * gehört. Das ist der Schlüssel für alles Weitere: aus `championship` und
 * `group` baut der Service die Tabellen-URL und der Mapper die Spiel-IDs.
 *
 * @returns {{ championship: string|null, group: string|null,
 *             competition: string|null, season: string|null }}
 */
function mapGroupContext($) {
  let context = { championship: null, group: null };
  // Beschriftung des Staffel-Links – das ist der saubere Liganame
  // ("Männer Oberliga - Nord"). Navigationslinks ohne Text werden dabei
  // übersprungen, sonst bliebe die Beschriftung leer.
  let groupLabel = null;

  $('a[href*="groupPage"]').each((i, a) => {
    const href = $(a).attr('href') ?? '';
    const group = /[?&]group=(\d+)/.exec(href)?.[1];
    const championship = /[?&]championship=([^&]+)/.exec(href)?.[1];
    if (!group || !championship) return;

    if (!context.group) {
      context = {
        group,
        championship: decodeURIComponent(championship.replace(/\+/g, ' ')),
      };
    }
    if (!groupLabel) groupLabel = toText(cellText($, a));
  });

  // Überschrift der Seite, z. B.
  //   "HHV 2025/2026 Männer Oberliga - Nord TV Hersfeld 1. Männer"
  // Daraus Saison ("2025/2026") und Ligabezeichnung ableiten.
  const heading = cellText($, $('h1').first());
  const season = /(\d{4}\/\d{2,4})/.exec(heading)?.[1] ?? null;

  // Liganame: bevorzugt die Beschriftung des Staffel-Links. Die Überschrift
  // ist nur die Rückfallebene – auf der Mannschaftsseite hängt dort zusätzlich
  // der Mannschaftsname dran ("… Oberliga - Nord TV Hersfeld 1. Männer").
  const competition =
    groupLabel ?? toText(season ? heading.split(season)[1] : heading) ?? null;

  return { ...context, competition, season };
}

// ---------------------------------------------------------------- Tabelle ---

/**
 * Tabellenseite (`groupPage`) -> { teamId, competition, season, rows[] }.
 *
 * Erwartete Spalten (Stand HHV 25/26):
 *   "" | Rang | Mannschaft | Begegnungen | S | U | N | Tore | +/- | Punkte
 * Gelesen wird über die Überschriften, damit eine zusätzliche oder
 * verschobene Spalte nichts kaputt macht.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} teamId eigene Mannschaft (nur zur Rückgabe, keine Filterung)
 * @param {object} [context] aus mapGroupContext()
 */
function mapTable($, teamId, context = {}) {
  const found = findTableByHeader($, ['mannschaft', 'punkte']);
  if (!found) {
    throw new HandballStructureError(
      'Auf der Staffelseite fehlt die Tabelle (Spalten "Mannschaft"/"Punkte").'
    );
  }

  const rows = [];

  {
    const { header } = found;
    const idx = {
      rank: columnIndex(header, 'rang', 'platz', 'pl.'),
      team: columnIndex(header, 'mannschaft'),
      games: columnIndex(header, 'begegnungen', 'spiele'),
      wins: columnIndex(header, 's'),
      draws: columnIndex(header, 'u'),
      losses: columnIndex(header, 'n'),
      goals: columnIndex(header, 'tore'),
      diff: columnIndex(header, '+/-', 'differenz'),
      points: columnIndex(header, 'punkte'),
    };

    for (const row of rowsOf($, found.table).slice(1)) {
      const { cells, el } = row;
      const name = idx.team >= 0 ? cells[idx.team] : null;
      if (!name) continue; // Zwischenüberschriften und Leerzeilen überspringen

      // "758:621" -> Tore für/gegen, "38:6" -> Plus-/Minuspunkte.
      const goals = parseScore(idx.goals >= 0 ? cells[idx.goals] : null);
      const points = parseScore(idx.points >= 0 ? cells[idx.points] : null);
      const rowTeamId = teamIdFromHref(
        $(el).find('a[href*="teamtable="]').attr('href')
      );

      rows.push({
        rank: toNumber(idx.rank >= 0 ? cells[idx.rank] : null) ?? rows.length + 1,
        teamId: rowTeamId,
        teamName: name,
        teamLogoUrl: null,
        games: toNumber(idx.games >= 0 ? cells[idx.games] : null),
        wins: toNumber(idx.wins >= 0 ? cells[idx.wins] : null),
        draws: toNumber(idx.draws >= 0 ? cells[idx.draws] : null),
        losses: toNumber(idx.losses >= 0 ? cells[idx.losses] : null),
        goalsFor: goals ? goals.home : null,
        goalsAgainst: goals ? goals.away : null,
        goalDifference:
          toNumber(idx.diff >= 0 ? cells[idx.diff] : null) ??
          (goals ? goals.home - goals.away : null),
        // nuLiga führt beide Punktwerte ("38:6"). Fehlt der Doppelpunkt,
        // steht dort nur die Pluszahl.
        points: points ? points.home : toNumber(idx.points >= 0 ? cells[idx.points] : null),
        pointsAgainst: points ? points.away : null,
      });
    }
  }

  return {
    teamId,
    competition: context.competition ?? null,
    season: context.season ?? null,
    rows,
  };
}

// --------------------------------------------------------------- Spielplan --

/**
 * Zustand eines Spiels aus Anwurfzeit und Ergebnis ableiten.
 * nuLiga kennt kein Statusfeld – der Zustand ergibt sich aus den Daten.
 */
function deriveState(startsAt, hasResult, now = Date.now()) {
  if (hasResult) return 'finished';
  if (!startsAt) return 'upcoming';

  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start) || now < start) return 'upcoming';

  // Angeworfen, aber noch kein Ergebnis veröffentlicht: eine Weile lang gilt
  // das als laufend. Danach ist das Spiel vorbei und nur der Bericht fehlt –
  // ein dauerhaftes LIVE-Badge wäre falsch.
  return now < start + LIVE_WINDOW_MINUTES * 60_000 ? 'live' : 'finished';
}

/**
 * Eine Spielplanzeile -> Spiel-DTO.
 *
 * @param {object} params
 * @param {string[]} params.cells Zelltexte der Zeile
 * @param {any} params.el Zeilen-Element (für die Links)
 * @param {object} params.idx Spaltenindizes
 * @param {string|null} params.currentDate fortgeschriebenes Datum
 * @param {string|null} params.perspectiveTeamId eigene Mannschaft
 */
function mapGameRow($, { cells, el, idx, currentDate, perspectiveTeamId }) {
  const homeName = idx.home >= 0 ? cells[idx.home] : null;
  const awayName = idx.away >= 0 ? cells[idx.away] : null;
  if (!homeName || !awayName) return null;

  // Ergebnis hat KEINE eigene Überschrift und teilt sich die Spalte mit den
  // Schiedsrichtern -> am Inhalt erkennen. Nur Zellen NACH der Gastmannschaft
  // betrachten, damit die Hallennummer nicht als Ergebnis durchgeht.
  let score = null;
  for (let i = Math.max(idx.away + 1, 0); i < cells.length; i += 1) {
    const candidate = parseScore(cells[i]);
    if (candidate) {
      score = candidate;
      break;
    }
  }

  // Spiel-ID aus dem Link auf den Spielbericht. Existiert erst, wenn ein
  // Bericht vorliegt – künftige Spiele haben deshalb keine ID (das Frontend
  // macht solche Zeilen dann schlicht nicht anklickbar).
  const meetingParts = meetingPartsFromHref(
    $(el).find('a[href*="meeting="]').attr('href')
  );

  const startsAt = toIsoDateTime(
    currentDate,
    idx.time >= 0 ? cells[idx.time] : null
  );
  const state = deriveState(startsAt, Boolean(score));

  const home = makeTeam(homeName);
  const away = makeTeam(awayName);

  // In Tabelle und Spielplan tragen die Mannschaften keine IDs; verglichen
  // wird deshalb über den Namen, den die Mannschaftsseite liefert.
  const isHome = perspectiveTeamId
    ? String(homeName) === String(perspectiveTeamId)
    : null;

  // nuLiga nennt in der Spalte "Ort" die Hallennummer, nicht den Hallennamen.
  // Als "Halle 12102" ist das für Mitglieder lesbar (so steht es auch im
  // Hallen-Aushang) – ein erfundener Name wäre schlechter.
  const hall = idx.venue >= 0 ? toText(cells[idx.venue]) : null;

  return {
    id: meetingParts ? encodeGameId(meetingParts) : null,
    number: idx.number >= 0 ? toText(cells[idx.number]) : null,
    startsAt,
    state,
    home,
    away,
    homeGoals: score ? score.home : null,
    awayGoals: score ? score.away : null,
    // Der Halbzeitstand steht nur im Spielbericht, nicht im Spielplan.
    homeGoalsHalftime: null,
    awayGoalsHalftime: null,
    competition: null, // wird unten aus dem Staffel-Kontext ergänzt
    venue: hall ? { name: `Halle ${hall}`, city: null } : null,
    isHome,
    opponent: isHome === null ? null : isHome ? away : home,
  };
}

/**
 * Spielplan einer Mannschaft (`teamPortrait`) oder einer Staffel
 * (`groupPage`) -> { teamId, games[] }.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} teamId
 * @param {object} [context] aus mapGroupContext()
 */
function mapSchedule($, teamId, context = {}) {
  const found = findTableByHeader($, ['datum', 'heimmannschaft', 'gastmannschaft']);
  if (!found) {
    throw new HandballStructureError(
      'Auf der Seite fehlt der Spielplan (Spalten "Datum"/"Heimmannschaft"/"Gastmannschaft").'
    );
  }

  const games = [];

  {
    const { header } = found;
    const idx = {
      date: columnIndex(header, 'datum'),
      time: columnIndex(header, 'zeit'),
      venue: columnIndex(header, 'ort', 'halle'),
      number: columnIndex(header, 'nr'),
      home: columnIndex(header, 'heimmannschaft'),
      away: columnIndex(header, 'gastmannschaft'),
    };

    // Der eigene Mannschaftsname steht in der Überschrift der Seite – nur so
    // lässt sich später „Heim oder Auswärts?" beantworten, weil der Spielplan
    // selbst keine Mannschafts-IDs enthält.
    const ownName = context.teamName ?? null;

    // nuLiga schreibt das Datum nur in die erste Zeile eines Spieltags.
    let currentDate = null;

    for (const row of rowsOf($, found.table).slice(1)) {
      const dateCell = idx.date >= 0 ? toText(row.cells[idx.date]) : null;
      if (dateCell) currentDate = dateCell;

      const game = mapGameRow($, {
        cells: row.cells,
        el: row.el,
        idx,
        currentDate,
        perspectiveTeamId: ownName,
      });
      if (!game) continue;

      game.competition = context.competition ?? null;
      games.push(game);
    }
  }

  games.sort((a, b) => {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt) - new Date(b.startsAt);
  });

  return { teamId, games };
}

/** Mannschaftsname der Seite `teamPortrait` (für die Heim-/Auswärts-Logik). */
function mapTeamName($) {
  // Die Überschrift endet mit dem Mannschaftsnamen, z. B.
  // "HHV 2025/2026 Männer Oberliga - Nord TV Hersfeld 1. Männer".
  // Zuverlässiger ist der Vereinsname aus der Info-Tabelle ("Verein").
  const found = findTableByHeader($, ['verein']);
  if (!found) return null;

  for (const row of rowsOf($, found.table)) {
    const labelIndex = row.cells.findIndex((c) => /^verein$/i.test(c));
    if (labelIndex >= 0 && row.cells[labelIndex + 1]) {
      // "TV Hersfeld Geistalhalle (12102) Waldhessenhalle (12103)"
      // -> alles vor der ersten Halle ist der Vereinsname.
      const raw = row.cells[labelIndex + 1];
      const name = raw.split(/\s{2,}|\s(?=[A-ZÄÖÜ][^\s]*halle)/)[0];
      return toText(name) ?? toText(raw);
    }
  }
  return null;
}

// ------------------------------------------------------------- Live-Ticker --

/**
 * Ereignisbezeichnungen von nuLiga -> Typen, die das Frontend kennt.
 * Schlüssel sind kleingeschrieben und ohne Trennzeichen.
 *
 * Die Liste stammt aus echten HHV-Spielberichten; unbekannte Bezeichnungen
 * landen als 'other' im Ticker und behalten ihren Originaltext, damit auch
 * neue Ereignisarten sichtbar bleiben statt zu verschwinden.
 */
const EVENT_TYPES = new Map([
  ['tor', 'goal'],
  ['7mmittor', 'penaltyGoal'],
  ['7metermittor', 'penaltyGoal'],
  ['siebenmetertor', 'penaltyGoal'],
  ['7mohnetor', 'penaltyMissed'],
  ['7meterohnetor', 'penaltyMissed'],
  ['2minuten', 'suspension'],
  ['2min', 'suspension'],
  ['zeitstrafe', 'suspension'],
  ['verwarnung', 'yellowCard'],
  ['gelbekarte', 'yellowCard'],
  ['disqualifikation', 'redCard'],
  ['disqualifikationmitbericht', 'redCard'],
  ['rotekarte', 'redCard'],
  ['blauekarte', 'blueCard'],
  ['auszeitheim', 'timeout'],
  ['auszeitgast', 'timeout'],
  ['auszeit', 'timeout'],
  ['timeout', 'timeout'],
  ['halbzeit', 'periodEnd'],
  ['spielende', 'final'],
]);

/** @returns {string} Typ des Frontends ('goal', 'suspension', … , 'other') */
function mapEventType(label) {
  const key = String(label ?? '')
    .toLowerCase()
    .replace(/[\s._-]/g, '');
  return EVENT_TYPES.get(key) ?? 'other';
}

/**
 * "33 Reinhardt, Fynn" -> "Reinhardt, Fynn".
 * Die führende Zahl ist die Trikotnummer; im Ticker steht ohnehin schon die
 * Mannschaft, deshalb bleibt der Name allein besser lesbar.
 */
function parsePlayer(value) {
  const text = toText(value);
  if (!text) return null;
  return toText(text.replace(/^\d{1,3}\s+/, '')) ?? text;
}

/**
 * Beschriftungen wie "Auszeit Heim"/"Auszeit Gast" tragen die Seite im Text –
 * die Spalte "Team" ist bei ihnen leer.
 */
function sideFromText(teamCell, label) {
  const source = `${teamCell ?? ''} ${label ?? ''}`.toLowerCase();
  if (/\bheim\b/.test(source)) return 'home';
  if (/\b(gast|auswärts)\b/.test(source)) return 'away';
  return null;
}

/**
 * Alle „Beschriftung | Wert"-Paare der Kopftabellen eines Spielberichts.
 * nuLiga legt sie in fünfspaltigen Tabellen ab:
 *   Spielnummer | 175 | | Gruppe          | Männer Oberliga - Nord
 *   Datum       | …   | | Heimmannschaft  | ESG Gensungen/Felsberg II
 */
function collectLabelledValues($) {
  const values = new Map();

  $('table').each((i, table) => {
    for (const row of rowsOf($, table)) {
      for (let c = 0; c < row.cells.length - 1; c += 1) {
        const label = row.cells[c];
        const value = row.cells[c + 1];
        if (label && value && !values.has(label.toLowerCase())) {
          values.set(label.toLowerCase(), value);
        }
      }
    }
  });

  return values;
}

/**
 * Spielbericht (`groupMeetingReport`) -> Ticker-DTO.
 *
 * WICHTIG zur Live-Fähigkeit: nuLiga veröffentlicht den Spielverlauf über
 * nuScore. Ob und wie schnell die Ereignisse WÄHREND des Spiels erscheinen,
 * hängt daran, ob am Zeitnehmertisch live erfasst wird. Liegt noch nichts
 * vor, liefert diese Funktion ein leeres, gültiges DTO mit Zustand 'live' –
 * das Widget zeigt dann den Hinweis, dass noch keine Ereignisse gemeldet sind.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} gameId zusammengesetzte ID (siehe config/handball.js)
 */
function mapTicker($, gameId) {
  const info = collectLabelledValues($);

  const homeName = info.get('heimmannschaft') ?? null;
  const awayName = info.get('gastmannschaft') ?? null;

  // "09.05.2026, Spielbeginn 17:00"
  const dateRaw = info.get('datum') ?? '';
  const startsAt = toIsoDateTime(
    /(\d{1,2}\.\d{1,2}\.\d{4})/.exec(dateRaw)?.[1] ?? null,
    /(\d{1,2}:\d{2})/.exec(dateRaw)?.[1] ?? null
  );

  // "34:32 (17:14)" – Endstand mit Halbzeitstand in Klammern.
  const resultRaw = info.get('ergebnis') ?? '';
  const finalScore = parseScore(/(\d{1,3}\s*:\s*\d{1,3})/.exec(resultRaw)?.[1]);
  const halftimeScore = parseScore(
    /\((\d{1,3}\s*:\s*\d{1,3})\)/.exec(resultRaw)?.[1]
  );

  // Vor dem Anwurf gibt es noch keinen Spielverlauf, aber IMMER den Kopf des
  // Spielberichts. Fehlen beide, ist es nicht der Spielbericht, den wir
  // erwarten – dann lieber die Notreserve als ein leerer Ticker.
  const found = findTableByHeader($, ['zeit', 'stand', 'ereignis']);
  if (!found && !homeName && !awayName) {
    throw new HandballStructureError(
      'Der Spielbericht enthält weder Mannschaften noch einen Spielverlauf.'
    );
  }

  const events = [];

  if (found) {
    const { header } = found;
    const idx = {
      team: columnIndex(header, 'team'),
      time: columnIndex(header, 'zeit'),
      score: columnIndex(header, 'stand'),
      event: columnIndex(header, 'ereignis'),
      person: columnIndex(header, 'person'),
    };

    rowsOf($, found.table)
      .slice(1)
      .forEach((row, position) => {
        const label = idx.event >= 0 ? toText(row.cells[idx.event]) : null;
        if (!label) return;

        const seconds = clockToSeconds(idx.time >= 0 ? row.cells[idx.time] : null);
        const score = parseScore(idx.score >= 0 ? row.cells[idx.score] : null);
        const type = mapEventType(label);

        events.push({
          // nuLiga vergibt keine Ereignis-IDs; Position plus Zeit ist innerhalb
          // eines Spiels eindeutig und bleibt beim Nachladen stabil.
          id: `${position}-${seconds ?? 'x'}`,
          // nur zum Sortieren, wird vor der Auslieferung entfernt
          position,
          type,
          clockSeconds: seconds,
          clock: idx.time >= 0 ? toText(row.cells[idx.time]) : null,
          // nuLiga zählt die Spielzeit durchgehend bis 60:00.
          period:
            seconds === null ? null : seconds > HALFTIME_MINUTES * 60 ? 2 : 1,
          side: sideFromText(
            idx.team >= 0 ? row.cells[idx.team] : null,
            label
          ),
          teamName: null,
          player: idx.person >= 0 ? parsePlayer(row.cells[idx.person]) : null,
          scoreHome: score ? score.home : null,
          scoreAway: score ? score.away : null,
          // Unbekannte Ereignisse behalten ihren Originaltext, damit sie im
          // Ticker sichtbar bleiben.
          text: type === 'other' ? label : null,
        });
      });
  }

  // Neuestes zuerst. Bei identischer Spielzeit (Zeitstrafe und Auszeit werden
  // oft auf dieselbe Sekunde gebucht) entscheidet die Reihenfolge im Bericht.
  events.sort(
    (a, b) =>
      (b.clockSeconds ?? 0) - (a.clockSeconds ?? 0) || b.position - a.position
  );

  const latestWithScore = events.find(
    (event) => event.scoreHome !== null && event.scoreAway !== null
  );

  // Sortierhilfe wieder entfernen – das DTO bleibt exakt so, wie das Frontend
  // es kennt.
  events.forEach((event) => delete event.position);

  const state = deriveState(startsAt, Boolean(finalScore));

  // Spielstand: Endstand aus dem Bericht, sonst der jüngste Zwischenstand aus
  // dem Verlauf (genau das, was einen laufenden Ticker ausmacht).
  const homeGoals = finalScore ? finalScore.home : (latestWithScore?.scoreHome ?? null);
  const awayGoals = finalScore ? finalScore.away : (latestWithScore?.scoreAway ?? null);

  return {
    gameId,
    game: {
      id: gameId,
      number: info.get('spielnummer') ?? null,
      startsAt,
      state,
      home: makeTeam(homeName),
      away: makeTeam(awayName),
      homeGoals,
      awayGoals,
      homeGoalsHalftime: halftimeScore ? halftimeScore.home : null,
      awayGoalsHalftime: halftimeScore ? halftimeScore.away : null,
      competition: info.get('gruppe') ?? null,
      // Der Spielbericht nennt – anders als der Spielplan – den echten
      // Hallennamen.
      venue: info.get('spielort') ? { name: info.get('spielort'), city: null } : null,
      isHome: null,
      opponent: null,
    },
    state,
    homeGoals,
    awayGoals,
    clock: events[0]?.clock ?? null,
    clockSeconds: events[0]?.clockSeconds ?? null,
    period: events[0]?.period ?? null,
    events,
  };
}

module.exports = {
  HandballStructureError,
  mapGroupContext,
  mapTeamName,
  mapTable,
  mapSchedule,
  mapTicker,
  deriveState,
  // Für Tests und spätere Wiederverwendung offengelegt.
  __internals: {
    cellText,
    toText,
    toNumber,
    rowsOf,
    findTableByHeader,
    columnIndex,
    parseScore,
    toIsoDateTime,
    clockToSeconds,
    mapEventType,
    parsePlayer,
    sideFromText,
    meetingPartsFromHref,
    collectLabelledValues,
  },
};
