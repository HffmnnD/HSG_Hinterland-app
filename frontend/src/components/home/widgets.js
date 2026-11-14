// Kacheln der Startseite. Die Schlüssel müssen zu HOME_WIDGETS in
// backend/personal/index.js passen. Reihenfolge hier = Standard.
export const HOME_WIDGETS = [
  { key: 'family', label: 'Meine Kinder', hint: 'Schnellzugriff auf Teamplaner deiner Kinder' },
  { key: 'next', label: 'Als Nächstes', hint: 'Die nächsten Trainings und Spiele' },
  { key: 'clubEvents', label: 'Vereinstermine', hint: 'Anstehende Veranstaltungen und offene Abfragen' },
  { key: 'live', label: 'Live & Ergebnisse', hint: 'Spiele deiner Mannschaften heute, mit Live-Ticker' },
  { key: 'calendar', label: 'Kalender', hint: 'Woche oder Monat mit Training, Spielen und Diensten' },
  { key: 'duties', label: 'Meine Dienste', hint: 'Wofür du eingetragen bist und was noch offen ist' },
  { key: 'teams', label: 'Meine Teams', hint: 'Eigene Mannschaften und Favoriten' },
];

const KEYS = HOME_WIDGETS.map((w) => w.key);

// Ohne eigene Einstellung bleibt die Startseite schlank: diese Kacheln sind
// zunächst ausgeblendet und lassen sich unter „Anpassen" zuschalten.
const DEFAULT_HIDDEN = ['clubEvents', 'live'];

/**
 * Gespeicherten Aufbau mit dem Standard zusammenführen: unbekannte Kacheln
 * fallen weg, neue (die es beim Speichern noch nicht gab) hängen hinten an.
 * @returns {{ order: string[], hidden: Set<string> }}
 */
export function resolveLayout(layout) {
  const saved = (layout?.order ?? []).filter((key) => KEYS.includes(key));
  const order = [...saved, ...KEYS.filter((key) => !saved.includes(key))];
  const hidden = layout ? (layout.hidden ?? []) : DEFAULT_HIDDEN;
  return { order, hidden: new Set(hidden.filter((key) => KEYS.includes(key))) };
}

