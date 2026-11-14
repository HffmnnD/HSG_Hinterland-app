// Hilfen für News und Spielberichte (Vorschautext, Datum, Spiel-Link).

/**
 * Anfang eines langen Textes – an einer Wortgrenze abgeschnitten.
 * Bewusst über die Zeichenzahl statt über gemessene Zeilen: Das ist auf jedem
 * Gerät gleich und braucht kein Nachmessen nach dem Laden der Schriften.
 */
export function excerpt(text, max) {
  const clean = String(text ?? '').trim();
  if (clean.length <= max) return { short: clean, cut: false };
  const slice = clean.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  return { short: `${slice.slice(0, lastBreak > max * 0.6 ? lastBreak : max).trimEnd()} …`, cut: true };
}

/** „Sa, 07.11.2026" aus "2026-11-07". */
export function formatReportDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Weg zur Spielseite (nuLiga-Spielverlauf) des verknüpften Spiels. */
export function reportGamePath(report) {
  if (!report.gameId || !report.team?.code) return null;
  return `/teams/${encodeURIComponent(report.team.code)}/spiele/${encodeURIComponent(report.gameId)}`;
}
