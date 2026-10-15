// Texte der Push-Nachrichten.
//
// Leitlinie: so schreiben, wie es ein:e Trainer:in in die Mannschaftsgruppe
// schreiben würde. Kurz, das Wichtigste in den Titel (was, wann), Ort und
// Grund in den Text. Keine Ausrufezeichen-Kaskaden, keine Emojis, keine
// Floskeln. Damit es nicht jedes Mal gleich klingt, gibt es je Fall ein paar
// Varianten – gewählt wird stabil über die Termin-ID, so bekommt die ganze
// Mannschaft denselben Text.
//
// Alle Funktionen sind rein (kein I/O) und liefern { title, body, url, tag }.

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_MS = 86400000;

/** Variante wählen – stabil je Seed, damit alle denselben Text sehen. */
function pick(variants, seed = 0) {
  const index = Math.abs(Number(seed) || 0) % variants.length;
  return variants[index];
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** `YYYY-MM-DDTHH:MM:SS` (Ortszeit) zerlegen. */
function splitIso(iso) {
  const [date, time = '00:00'] = String(iso).replace(' ', 'T').split('T');
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day, time: time.slice(0, 5) };
}

/**
 * Wann, so wie man es sagt: „heute", „morgen", „am Donnerstag" (diese Woche)
 * oder „am 23.10.".
 */
function dayPhrase(iso, now = new Date()) {
  const { year, month, day } = splitIso(iso);
  const target = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target - today) / DAY_MS);

  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff > 1 && diff < 7) return `am ${WEEKDAYS[target.getDay()]}`;
  return `am ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

/** „18:30" */
const timeOf = (iso) => splitIso(iso).time;

/** Gegner aus „HSG Hinterland – TV Hüttenberg" und ob es ein Heimspiel ist. */
function matchup(title) {
  const sides = String(title).split(' – ');
  if (sides.length !== 2) return null;
  const homeIsUs = /hinterland/i.test(sides[0]);
  const awayIsUs = /hinterland/i.test(sides[1]);
  if (homeIsUs === awayIsUs) return null;
  return { opponent: homeIsUs ? sides[1] : sides[0], home: homeIsUs };
}

/**
 * Wie der Termin im Satz heißt: „Training", „Heimspiel gegen TV Hüttenberg",
 * „Handballcamp".
 */
function what(event) {
  if (event.type === 'MATCH') {
    const game = matchup(event.title);
    if (!game) return event.title;
    return `${game.home ? 'Heimspiel' : 'Auswärtsspiel'} gegen ${game.opponent}`;
  }
  if (event.type === 'EVENT_CAMP') return event.title;
  // Trainings heißen meist „Training"; ein eigener kurzer Titel
  // („Athletik", „Torwarttraining") ist aussagekräftiger.
  return event.title && event.title.length <= 30 ? event.title : 'Training';
}

const isTraining = (event) =>
  event.type === 'REGULAR_TRAINING' || event.type === 'SINGLE_TRAINING';

/** „Fr 16.10." */
function shortDate(iso) {
  const { year, month, day } = splitIso(iso);
  const weekday = WEEKDAYS_SHORT[new Date(year, month - 1, day).getDay()];
  return `${weekday} ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.`;
}

/** „Herren 1 · 18:30 Uhr, Sporthalle Gladenbach" */
function detailLine(event, iso = event.startTime) {
  const place = event.location ? `, ${event.location}` : '';
  const team = event.teamName ? `${event.teamName} · ` : '';
  return `${team}${timeOf(iso)} Uhr${place}`;
}

const eventUrl = () => '/kalender';
const eventTag = (event) => `event-${event.id}`;

// --- Absagen und Änderungen ----------------------------------------------

function cancelled(event, reason, now) {
  const day = dayPhrase(event.startTime, now);
  const name = what(event);
  let title;
  if (name === 'Training') {
    title = pick(
      [`Training ${day} fällt aus`, `Kein Training ${day}`, `${capitalize(day)} kein Training`],
      event.id
    );
  } else if (isTraining(event)) {
    title = pick([`${name} ${day} fällt aus`, `${capitalize(day)}: ${name} fällt aus`], event.id);
  } else {
    title = pick([`${name} ${day} abgesagt`, `Abgesagt: ${name} ${day}`], event.id);
  }
  const body = reason
    ? `${reason} – ${detailLine(event)}`
    : detailLine(event);
  return { title, body, url: eventUrl(), tag: eventTag(event), urgent: true };
}

function reinstated(event, now) {
  const day = dayPhrase(event.startTime, now);
  const name = what(event);
  return {
    title: pick(
      [`${name} ${day} findet doch statt`, `Kommando zurück: ${name} ${day} läuft`],
      event.id
    ),
    body: detailLine(event),
    url: eventUrl(),
    tag: eventTag(event),
    urgent: true,
  };
}

function deleted(event, now) {
  const day = dayPhrase(event.startTime, now);
  return {
    title: pick([`${what(event)} ${day} gestrichen`, `${what(event)} ${day} entfällt`], event.id),
    body: `${detailLine(event)} – steht nicht mehr im Kalender.`,
    url: eventUrl(),
    tag: eventTag(event),
    urgent: true,
  };
}

/**
 * Zeit und/oder Ort geändert. Liefert null, wenn sich nichts geändert hat,
 * das jemanden betrifft (z. B. nur der Titel).
 */
function changed(before, after, now) {
  const movedTime = before.startTime !== after.startTime;
  const movedPlace = (before.location ?? '') !== (after.location ?? '');
  if (!movedTime && !movedPlace) return null;

  const oldDay = dayPhrase(before.startTime, now);
  const name = what(after);

  if (!movedTime) {
    return {
      title: pick([`${name} ${oldDay}: andere Halle`, `${name} ${oldDay} woanders`], after.id),
      body: after.location
        ? `Jetzt in ${after.location} · ${timeOf(after.startTime)} Uhr`
        : `Ort noch offen · ${timeOf(after.startTime)} Uhr`,
      url: eventUrl(),
      tag: eventTag(after),
      urgent: true,
    };
  }

  const sameDay = before.startTime.slice(0, 10) === after.startTime.slice(0, 10);
  return {
    title: sameDay
      ? pick(
          [
            `${name} ${oldDay}: neue Zeit`,
            `${name} ${oldDay} beginnt ${after.startTime > before.startTime ? 'später' : 'früher'}`,
          ],
          after.id
        )
      : pick([`${name} ${oldDay} verschoben`, `${name} ${oldDay} wird verlegt`], after.id),
    body: movedTo(before.startTime, after, now),
    url: eventUrl(),
    tag: eventTag(after),
    urgent: true,
  };
}

/** „Jetzt morgen um 19:00 Uhr statt 18:30 · Sporthalle X" */
function movedTo(previousIso, event, now) {
  const newDay = dayPhrase(event.startTime, now);
  const sameDay = previousIso.slice(0, 10) === event.startTime.slice(0, 10);
  const place = event.location ? ` · ${event.location}` : '';
  return sameDay
    ? `Jetzt ${timeOf(event.startTime)} statt ${timeOf(previousIso)} Uhr${place}`
    : `Neu: ${newDay} um ${timeOf(event.startTime)} Uhr (vorher ${dayPhrase(previousIso, now)}, ${timeOf(previousIso)})${place}`;
}

/** Ligaspiel vom Verband verlegt (nuLiga). */
function rescheduled(event, previousStart, newStart, now) {
  const updated = { ...event, startTime: newStart };
  return {
    title: pick([`${what(event)} verlegt`, `Neuer Anwurf: ${what(event)}`], event.id),
    body: movedTo(previousStart, updated, now),
    url: eventUrl(),
    tag: eventTag(event),
  };
}

// --- Neue Termine ------------------------------------------------------------

function created(event, now) {
  const day = dayPhrase(event.startTime, now);
  let title;
  if (event.type === 'SINGLE_TRAINING') {
    title = pick([`Extra-Training ${day}`, `Zusätzliches Training ${day}`], event.id);
  } else if (event.type === 'MATCH') {
    title = `Neu im Kalender: ${what(event)}`;
  } else {
    title = pick([`Neu im Kalender: ${what(event)}`, `${what(event)} ${day}`], event.id);
  }
  const place = event.location ? `, ${event.location}` : '';
  return {
    title,
    body: `${event.teamName} · ${shortDate(event.startTime)}, ${timeOf(event.startTime)} Uhr${place}`,
    url: eventUrl(),
    tag: eventTag(event),
  };
}

/** Wochentage aus einer ISO-Liste (1 = Montag) als „Di & Do". */
function weekdayList(weekdays) {
  const names = weekdays.map((day) => WEEKDAYS_SHORT[day % 7]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function seriesCreated(series, teamName) {
  const place = series.location ? `, ${series.location}` : '';
  return {
    title: pick(['Neue Trainingszeiten', 'Der Trainingsplan steht'], series.id),
    body: `${teamName}: ${weekdayList(series.weekdays)}, ${series.startTime}–${series.endTime} Uhr${place}. Ab ${shortDate(series.startsOn)}`,
    url: eventUrl(),
    tag: `series-${series.id}`,
  };
}

function seriesMoved(event) {
  return {
    title: pick([`${what(event)}: neue Halle`, `${what(event)} zieht um`], event.seriesId),
    body: event.location
      ? `${event.teamName}: ab sofort in ${event.location}.`
      : `${event.teamName}: Ort wird noch bekannt gegeben.`,
    url: eventUrl(),
    tag: `series-${event.seriesId}`,
  };
}

function seriesEnded(series, teamName, removed) {
  return {
    title: pick([`${series.title}: Serie beendet`, `${series.title} läuft aus`], series.id),
    body:
      removed === 1
        ? `${teamName}: Die nächste Einheit ist gestrichen.`
        : `${teamName}: ${removed} kommende Einheiten sind gestrichen.`,
    url: eventUrl(),
    tag: `series-${series.id}`,
  };
}

// --- Erinnerung ----------------------------------------------------------------

const TRAINING_NUDGES = [
  'Kannst du nicht? Dann sag kurz in der App ab.',
  'Wer nicht kann, bitte rechtzeitig absagen.',
  'Was dazwischengekommen? Kurz absagen reicht.',
];

function reminder(event, now = new Date()) {
  const startMs = new Date(event.startTime).getTime();
  const minutes = Math.round((startMs - now.getTime()) / 60000);
  const name = what(event);
  const day = dayPhrase(event.startTime, now);

  let title;
  if (minutes <= 75) title = `${name} in einer Stunde`;
  else if (minutes <= 150) title = `${name} in zwei Stunden`;
  else title = `${capitalize(day)} ${timeOf(event.startTime)}: ${name}`;

  const place = event.location ? `${event.location}. ` : '';
  const body =
    event.type === 'MATCH'
      ? `Anwurf ${timeOf(event.startTime)} Uhr${event.location ? ` in ${event.location}` : ''}. Wer fehlt, bitte absagen.`
      : `${place}${pick(TRAINING_NUDGES, event.id)}`;

  return {
    title,
    body,
    url: eventUrl(),
    tag: `reminder-${event.id}`,
    // Nach Beginn ist die Erinnerung wertlos.
    ttl: Math.max(60, minutes * 60),
  };
}

// --- Trainerteam ---------------------------------------------------------------

function shortNoticeDecline(event, person, userId, reason, now) {
  const name = `${person.first_name} ${person.last_name}`;
  const day = dayPhrase(event.startTime, now);
  return {
    title: pick([`${name} sagt ab`, `Absage: ${name}`], event.id),
    body: `${what(event)} ${day}, ${timeOf(event.startTime)} Uhr${reason ? ` – „${reason}“` : ''}`,
    url: eventUrl(),
    tag: `decline-${event.id}-${userId}`,
  };
}

function joinRequest(request) {
  const role = request.relation_type === 'coach' ? 'Trainer:in' : 'Spieler:in';
  return {
    title: pick(
      [`${request.first_name} möchte zu ${request.team_name}`, 'Neue Beitrittsanfrage'],
      request.team_id
    ),
    body: `${request.first_name} ${request.last_name} fragt als ${role} an. Bestätigen kannst du auf der Mannschaftsseite.`,
    url: `/teams/${request.team_code}`,
    tag: `request-${request.team_id}`,
  };
}

function membershipConfirmed(team, relationType) {
  if (relationType === 'coach') {
    return {
      title: 'Du bist im Trainerteam',
      body: `${team.name}: Termine und Kader kannst du jetzt selbst verwalten.`,
      url: `/teams/${team.code}`,
      tag: `team-${team.id}`,
    };
  }
  return {
    title: pick(['Du bist im Kader', `Willkommen bei ${team.name}`], team.id),
    body: `${team.name} hat dich bestätigt. Trainingszeiten und Spiele stehen ab jetzt in deinem Kalender.`,
    url: `/teams/${team.code}`,
    tag: `team-${team.id}`,
  };
}

// --- Verein --------------------------------------------------------------------

/** Anfang eines Textes bis zur Wortgrenze. */
function excerpt(text, max = 140) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : max)}…`;
}

function news(post) {
  return {
    title: post.title,
    body: excerpt(post.content),
    url: '/',
    tag: `news-${post.id}`,
  };
}

function test() {
  return {
    title: 'Push ist an',
    body: 'Genau so kommen Absagen, Erinnerungen und News auf dieses Gerät.',
    url: '/',
    tag: 'push-test',
  };
}

module.exports = {
  dayPhrase,
  what,
  weekdayList,
  excerpt,
  cancelled,
  reinstated,
  deleted,
  changed,
  rescheduled,
  created,
  seriesCreated,
  seriesMoved,
  seriesEnded,
  reminder,
  shortNoticeDecline,
  joinRequest,
  membershipConfirmed,
  news,
  test,
};
