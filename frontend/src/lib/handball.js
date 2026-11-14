// Darstellungs-Helfer für das Handball-Modul (Tabelle, Spielplan, Ticker).
//
// Enthält bewusst KEINE Datenbeschaffung – nur die Übersetzung der DTOs aus
// `/api/handball/*` in das, was auf dem Bildschirm steht. So bleiben die
// Widgets schlank und die Beschriftungen an einer Stelle pflegbar.

/** Reguläre Spieldauer in Minuten (Erwachsene: 2 x 30). */
export const FULL_GAME_MINUTES = 60;

// ------------------------------------------------------------ Spielstatus --

/**
 * Beschriftung und Badge-Variante je Spielzustand.
 * Die Varianten entsprechen den `.badge-*`-Klassen aus index.css.
 */
export const GAME_STATUS = {
  upcoming: { label: 'Demnächst', variant: 'neutral' },
  live: { label: 'Live', variant: 'live' },
  finished: { label: 'Beendet', variant: 'confirmed' },
  cancelled: { label: 'Abgesagt', variant: 'pending' },
};

export function gameStatus(state) {
  return GAME_STATUS[state] ?? GAME_STATUS.upcoming;
}

// ------------------------------------------------------------- Ergebnisse --

/**
 * Spielstand als „30:28". Ohne Zahlen (noch nicht angeworfen) „–:–".
 * Niemals „0:0" für ein Spiel ohne Ergebnis – das wäre eine Falschaussage.
 */
export function formatScore(homeGoals, awayGoals) {
  if (homeGoals === null || homeGoals === undefined) return '–:–';
  if (awayGoals === null || awayGoals === undefined) return '–:–';
  return `${homeGoals}:${awayGoals}`;
}

/**
 * Punkte im deutschen Format „17:3". Fehlen die Minuspunkte, wird nur die
 * Pluszahl gezeigt (manche Ligen führen nur Pluspunkte).
 */
export function formatPoints(points, pointsAgainst) {
  if (points === null || points === undefined) return '—';
  if (pointsAgainst === null || pointsAgainst === undefined) return String(points);
  return `${points}:${pointsAgainst}`;
}

/** Tordifferenz mit Vorzeichen („+50", „-5", „0"). */
export function formatGoalDifference(difference) {
  if (difference === null || difference === undefined) return '—';
  return difference > 0 ? `+${difference}` : String(difference);
}

/** Zahl oder „—" (Tabellenzellen ohne Wert bleiben leer statt „null"). */
export function formatNumber(value) {
  return value === null || value === undefined ? '—' : String(value);
}

// ------------------------------------------------------------------ Zeiten --

/** Anwurfzeit kurz: „Sa, 20.09. · 18:00". */
export function formatKickoff(isoDate) {
  if (!isoDate) return 'Termin offen';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Termin offen';

  const day = date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const time = date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} · ${time} Uhr`;
}

/** Sekunden -> „mm:ss". */
export function formatClock(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Rechnerische Restzeit.
 *
 * ACHTUNG – bewusste Einschränkung: nuLiga liefert KEINE laufende Uhr,
 * sondern nur die Spielzeit der zuletzt gemeldeten Aktion. Die Restzeit ist
 * daher der Stand der letzten Aktion, nicht die Sekunde am Hallenzeitnehmer.
 * Die UI muss das kenntlich machen (siehe LiveTickerWidget), damit niemand
 * sie für eine echte Live-Uhr hält.
 *
 * @param {number|null} clockSeconds gespielte Zeit laut letztem Ereignis
 * @param {number|null} period 1 = erste Halbzeit, 2 = zweite Halbzeit
 * @param {number} durationMinutes reguläre Spieldauer (Jugend spielt kürzer)
 * @returns {string|null} „12:30" oder null, wenn nichts berechenbar ist
 */
export function remainingTime(
  clockSeconds,
  period = null,
  durationMinutes = FULL_GAME_MINUTES
) {
  if (clockSeconds === null || clockSeconds === undefined) return null;

  const halfSeconds = (durationMinutes / 2) * 60;
  // Zählt der Verband je Halbzeit neu (Uhr < Halbzeitlänge, 2. Halbzeit),
  // muss die erste Halbzeit dazugerechnet werden.
  const elapsed =
    period === 2 && clockSeconds <= halfSeconds
      ? clockSeconds + halfSeconds
      : clockSeconds;

  const remaining = durationMinutes * 60 - elapsed;
  return remaining <= 0 ? '00:00' : formatClock(remaining);
}

// ------------------------------------------------------------- Ereignisse --

/**
 * Ticker-Ereignisse: Kurzlabel (versal, wie auf der Anzeigetafel), Langtext
 * für Vorlesehilfen, Farbrolle und – bei Karten – die Kartenfarbe.
 *
 * Bewusst KEINE Emojis: die sehen auf jedem Gerät anders aus und wirken
 * neben der Vereinstypografie wie Fremdkörper. Karten zeichnet das Frontend
 * als kleines farbiges Rechteck (<CardMark>).
 *
 * `tone`: 'goal' grün · 'warn' bernstein · 'danger' rot · 'neutral' grau
 * `marker`: Ereignisse auf der Zeitleiste, die keiner Mannschaft gehören
 *           (Anwurf, Halbzeit, Ende) – werden als Trenner dargestellt.
 */
export const EVENT_META = {
  goal: { short: 'Tor', label: 'Tor', tone: 'goal' },
  penaltyGoal: { short: '7m', label: '7-Meter-Tor', tone: 'goal' },
  penaltyMissed: { short: '7m verworfen', label: '7-Meter verworfen', tone: 'neutral' },
  ownGoal: { short: 'Eigentor', label: 'Eigentor', tone: 'neutral' },
  suspension: { short: '2 Min', label: '2 Minuten', tone: 'warn' },
  yellowCard: { short: 'Gelb', label: 'Gelbe Karte', tone: 'warn', card: 'yellow' },
  redCard: { short: 'Rot', label: 'Rote Karte', tone: 'danger', card: 'red' },
  blueCard: { short: 'Blau', label: 'Blaue Karte (Disqualifikation mit Bericht)', tone: 'danger', card: 'blue' },
  timeout: { short: 'Auszeit', label: 'Team-Auszeit', tone: 'neutral' },
  periodStart: { short: 'Anwurf', label: 'Anwurf', tone: 'neutral', marker: true },
  periodEnd: { short: 'Halbzeit', label: 'Halbzeit', tone: 'neutral', marker: true },
  final: { short: 'Ende', label: 'Spielende', tone: 'neutral', marker: true },
  other: { short: 'Info', label: 'Ereignis', tone: 'neutral' },
};

export function eventMeta(type) {
  return EVENT_META[type] ?? EVENT_META.other;
}

/** Tailwind-Klassen je Farbrolle eines Ereignisses. */
export const EVENT_TONE_CLASS = {
  goal: 'border-hsg-green-line bg-hsg-green-soft',
  warn: 'border-warn-line bg-warn-soft',
  danger: 'border-danger-line bg-danger-soft',
  neutral: 'border-line bg-surface',
};

/** Textfarbe des Kurzlabels je Farbrolle. */
export const EVENT_LABEL_CLASS = {
  goal: 'text-hsg-green-darker',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-ink-muted',
};

/**
 * Vereinsnamen von Spielgemeinschaften („HSG Weiters./Braunsh.Worf. II")
 * haben lange Wörter ohne Leerzeichen. Unsichtbare Umbruchpunkte nach „/"
 * und nach Abkürzungspunkten lassen sie auf dem Handy dort umbrechen statt
 * mitten im Wort.
 */
export function breakable(name) {
  return name ? String(name).replace(/\//g, '/​').replace(/\.(?=\S)/g, '.​') : name;
}

/** „#7 Hanst, Lena" – Trikotnummer vorn, wie auf dem Spielberichtsbogen. */
export function formatPlayer(name, number) {
  if (!name) return null;
  return number ? `#${number} ${name}` : name;
}

/**
 * Mannschaftsfarben im Ticker (Legende in der Anzeigetafel): Heim im
 * Vereinsgrün, Gast in Anthrazit – beide aus den Design-Tokens, damit sie im
 * hellen und dunklen Modus funktionieren.
 */
export const TEAM_COLOR_CLASS = {
  home: 'bg-hsg-green text-white',
  away: 'bg-ink text-paper',
};

/** ISO-Zeitpunkt -> „18:02" (Ortszeit). */
export function formatWallClock(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 7-Meter eindeutig: „5 von 7 verwandelt". Ohne Versuche: null.
 * (Nie „5/7m" – das liest sich wie „5 von 7 Metern".)
 */
export function formatPenalties(goals, attempts) {
  if (!attempts) return null;
  return `${goals} von ${attempts}`;
}

/**
 * Zeile eines Ereignisses als Text – für Vorlesehilfen (aria-label) und als
 * Rückfallebene, wenn kein Spielername geliefert wurde.
 */
export function describeEvent(event, homeName, awayName) {
  const meta = eventMeta(event.type);
  const team =
    event.teamName ??
    (event.side === 'home' ? homeName : event.side === 'away' ? awayName : null);

  return [
    event.clock ? `Minute ${event.clock}` : null,
    meta.label,
    formatPlayer(event.player, event.playerNumber),
    team ? `(${team})` : null,
    event.scoreHome !== null && event.scoreHome !== undefined && event.scoreAway !== null
      ? `Stand ${event.scoreHome}:${event.scoreAway}`
      : null,
    event.text,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ----------------------------------------------------------------- Meta ----

/**
 * Hinweistext zur Datenherkunft, den alle drei Widgets unten anzeigen.
 * @param {{ source:string, stale:boolean, available:boolean, fetchedAt:string|null }} meta
 */
export function describeSource(meta) {
  if (!meta) return null;

  if (!meta.available) {
    return 'nuLiga nicht erreichbar';
  }

  const stamp = meta.fetchedAt
    ? new Date(meta.fetchedAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  if (meta.stale) {
    return stamp ? `nuLiga nicht erreichbar · Stand ${stamp} Uhr` : 'nuLiga nicht erreichbar';
  }

  return stamp ? `Stand ${stamp} Uhr` : null;
}
