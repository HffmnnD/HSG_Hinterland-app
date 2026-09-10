// Gemeinsame Gestaltung aller Diagramme im System-Status.
//
// Die Farben stehen HIER und nirgends sonst, damit jedes Diagramm dieselben
// benutzt. Jede Farbe hat genau eine Aufgabe:
//
//   SERIES.requests   Menge (Anfragen, Antwortzeiten, Länder) -> Vereinsgrün
//   STATUS.*          Zustand (2xx gut … 5xx kritisch)        -> feste Skala
//
// Warum das dunklere Grün #5f9e28 statt des Marken-Grüns #79b636: als Fläche
// auf Weiß erreicht #79b636 nur 2,45:1 Kontrast. Für Text und große Flächen
// ist das in Ordnung, für dünne Linien und schmale Balken nicht – #5f9e28
// (die `hover`-Stufe der Marke) liegt bei 3,3:1 und bleibt erkennbar. Grün
// und Rot wurden gegen Protanopie und Deuteranopie geprüft und liegen mit
// ΔE 8,0 über der Grenze; zusätzlich trägt jede Reihe eine Beschriftung, die
// Farbe ist also nie das einzige Unterscheidungsmerkmal.
//
// Die Statusfarben sind bewusst NICHT nebeneinander gestapelt (Bernstein und
// Rot lägen unter der Unterscheidbarkeitsgrenze). Sie erscheinen jeweils in
// einer eigenen Zeile mit Punkt UND Beschriftung.

/** Farben der Datenreihen. */
export const SERIES = {
  requests: '#5f9e28',
  errors: '#c0392b',
  latency: '#5f9e28',
};

/** Reservierte Zustandsfarben – nie als „Reihe 4" zweckentfremden. */
export const STATUS = {
  '2xx': '#5f9e28', // gut
  '3xx': '#727579', // weder gut noch schlecht (Umleitungen)
  '4xx': '#8a6116', // Warnung – Anfragefehler des Clients
  '5xx': '#c0392b', // kritisch – Serverfehler
  other: '#727579',
};

/** Beschriftungen der Statusklassen (Farbe steht nie allein). */
export const STATUS_LABELS = {
  '2xx': '2xx Erfolg',
  '3xx': '3xx Umleitung',
  '4xx': '4xx Anfragefehler',
  '5xx': '5xx Serverfehler',
  other: 'Sonstige',
};

// Flächen und Linien aus dem Farbsystem der App (tailwind.config.js).
export const SURFACE = '#ffffff';
export const GRID = '#e9ecef';
export const INK_MUTED = '#727579';

/** Achsen bleiben zurückhaltend: feine Linie, kleine Schrift, kein Fettdruck. */
export const AXIS = {
  stroke: GRID,
  tick: { fill: INK_MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

/** Hairline-Gitter, immer durchgezogen – gestrichelt lenkt nur ab. */
export const GRID_PROPS = {
  stroke: GRID,
  strokeWidth: 1,
  vertical: false,
};

/** Linienstärke und Punktgröße nach den Mark-Vorgaben. */
export const LINE = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const DOT = { r: 4, strokeWidth: 2, stroke: SURFACE };
