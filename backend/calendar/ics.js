// iCalendar (RFC 5545) ohne Zusatzpaket. Zeiten stehen in der Datenbank in
// Ortszeit, deshalb TZID=Europe/Berlin mit passender VTIMEZONE: So zeigen
// Google, Apple und Outlook 19:00 Uhr auch nach der Zeitumstellung richtig an.

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Text-Werte: Backslash, Semikolon, Komma und Zeilenumbrüche maskieren. */
function escapeText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Zeilen über 75 Byte falten (Fortsetzung beginnt mit einem Leerzeichen). */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = Buffer.byteLength(char, 'utf8');
    const limit = parts.length === 0 ? 75 : 74;
    if (size + charSize > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** 'YYYY-MM-DDTHH:MM:SS' oder 'YYYY-MM-DD HH:MM:SS' -> 'YYYYMMDDTHHMMSS' */
const localStamp = (value) => String(value).replace(/[-:]/g, '').replace(' ', 'T').slice(0, 15);

const utcStamp = (date = new Date()) => `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;

/**
 * @param {{ name:string, entries: {uid,start,end,title,location?,description?,cancelled?,updated?}[] }} calendar
 * @returns {string}
 */
function buildCalendar({ name, entries }) {
  const now = utcStamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HSG Hinterland//App//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Hinweis an Kalender-Apps, wie oft sie nachsehen sollen.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
  ];
  for (const entry of entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/Berlin:${localStamp(entry.start)}`,
      `DTEND;TZID=Europe/Berlin:${localStamp(entry.end)}`,
      `SUMMARY:${escapeText(entry.cancelled ? `Abgesagt: ${entry.title}` : entry.title)}`
    );
    if (entry.location) lines.push(`LOCATION:${escapeText(entry.location)}`);
    if (entry.description) lines.push(`DESCRIPTION:${escapeText(entry.description)}`);
    if (entry.cancelled) lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { buildCalendar };
