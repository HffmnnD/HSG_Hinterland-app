// Einteilung und Beschriftung der Mannschaften für die Oberfläche.
//
// Der Verein pflegt in der Verwaltung nur zwei freie Felder je Mannschaft:
// `ageGroup` („C-Jugend", „Erwachsene", …) und `gender` (male/female/mixed).
// Die Gruppierung der Übersicht leitet sich daraus ab, statt eine dritte
// Spalte einzuführen, die jemand zusätzlich pflegen müsste.

/** Geschlecht einer Mannschaft – ausgeschrieben. */
export const GENDER_LABELS = {
  male: 'Männlich',
  female: 'Weiblich',
  mixed: 'Gemischt',
};

export function genderLabel(gender) {
  return GENDER_LABELS[gender] ?? null;
}

/**
 * Erkennt eine Jugendmannschaft an der Altersklasse.
 *
 * Trifft „A-Jugend" bis „E-Jugend", „Minis", „U12" und alles, was das Wort
 * „Jugend" enthält – die Schreibweisen, die in einem Handballverein
 * tatsächlich vorkommen. Bewusst großzügig: eine falsch einsortierte
 * Mannschaft steht immer noch in der Übersicht, nur unter „Weitere".
 */
const YOUTH_PATTERN = /jugend|jgd|minis?|\bu\s?\d{1,2}\b|^[a-e]\s*-\s*jug/i;
const SENIOR_PATTERN = /erwachsen|senior|herren|damen|aktive/i;

/** @returns {'youth'|'senior'|'other'} */
export function teamGroupKey(team) {
  const age = (team.ageGroup ?? '').trim();
  const name = (team.name ?? '').trim();

  if (YOUTH_PATTERN.test(age) || YOUTH_PATTERN.test(name)) return 'youth';
  if (SENIOR_PATTERN.test(age) || SENIOR_PATTERN.test(name)) return 'senior';
  return 'other';
}

/**
 * Reihenfolge der Abschnitte in der Mannschaftsübersicht: Erwachsene zuerst
 * (danach suchen die meisten), dann die Jugend, dann alles, was sich nicht
 * einordnen lässt.
 */
export const TEAM_GROUPS = [
  { key: 'senior', label: 'Senioren' },
  { key: 'youth', label: 'Jugend' },
  { key: 'other', label: 'Weitere Mannschaften' },
];

/**
 * Mannschaften in die Abschnitte der Übersicht einteilen. Leere Abschnitte
 * fallen weg – ein Verein ohne Jugend soll keine leere Überschrift sehen.
 *
 * Die Reihenfolge INNERHALB eines Abschnitts bleibt die des Servers
 * (`sort_order`, dann Name): Sie ist in der Verwaltung gepflegt und soll
 * überall gleich sein.
 *
 * @param {{id:number, name:string, code:string, ageGroup:string|null,
 *          gender:string|null}[]} teams
 * @returns {{key:string, label:string, teams:object[]}[]}
 */
export function groupTeams(teams) {
  return TEAM_GROUPS.map((group) => ({
    ...group,
    teams: teams.filter((team) => teamGroupKey(team) === group.key),
  })).filter((group) => group.teams.length > 0);
}

/**
 * Zeile unter dem Mannschaftsnamen: „C-Jugend · Männlich".
 * Fehlt beides, gibt die Funktion null zurück – dann zeigt die Karte nichts
 * an, statt einen Gedankenstrich zu setzen.
 */
export function teamMeta(team) {
  const parts = [team.ageGroup, genderLabel(team.gender)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// --------------------------------------------------- Bildausschnitt im Banner

/**
 * Grenzen der Vergrößerung in Prozent. Müssen zu MIN_/MAX_PHOTO_ZOOM in
 * backend/utils/validation.js passen.
 */
export const PHOTO_ZOOM_MIN = 100;
export const PHOTO_ZOOM_MAX = 300;

/**
 * Stil des Mannschaftsfotos im Kopfbereich.
 *
 * Drei Prozentwerte aus der Datenbank werden zu zwei CSS-Eigenschaften:
 *
 *   object-position   welcher Punkt des Bildes in der Mitte des Streifens
 *                     liegt – damit rutschen Köpfe ins Bild
 *   transform: scale  die Vergrößerung, verankert am GLEICHEN Punkt
 *                     (transform-origin), damit Heranzoomen den gewählten
 *                     Bildteil nicht wieder wegschiebt
 *
 * Bewusst ein Stil-Objekt und keine CSS-Klassen: Die Werte sind stufenlos und
 * kommen aus der Datenbank – als Klassen wären das 101 × 101 × 41 Varianten.
 *
 * @param {{ photoFocusX?:number, photoFocusY?:number, photoZoom?:number,
 *           focusX?:number, focusY?:number, zoom?:number }} source
 *   Nimmt sowohl eine Mannschaft aus der API als auch den Entwurf im Dialog.
 */
export function photoFrameStyle(source = {}) {
  const focusX = source.focusX ?? source.photoFocusX ?? 50;
  const focusY = source.focusY ?? source.photoFocusY ?? 50;
  const zoom = source.zoom ?? source.photoZoom ?? PHOTO_ZOOM_MIN;

  const position = `${focusX}% ${focusY}%`;
  return {
    objectPosition: position,
    // Bei 100 % gar keine Transformation setzen: Ein `scale(1)` erzeugt sonst
    // eine eigene Zeichenebene und macht das Bild auf manchen Geräten messbar
    // unscharf.
    ...(zoom !== PHOTO_ZOOM_MIN
      ? { transform: `scale(${zoom / 100})`, transformOrigin: position }
      : null),
  };
}

/**
 * Kürzel aus dem Mannschaftsnamen ableiten („Weibliche Jugend C" -> „WJC").
 *
 * Das Kürzel ist nur noch technischer Schlüssel (Adresse der Mannschaftsseite)
 * und wird nirgends mehr angezeigt – deshalb erzeugt es die App selbst, statt
 * es beim Anlegen abzufragen. Ist es schon vergeben, wird hochgezählt
 * („WJC-2"). Erlaubt sind wie im Backend A–Z, 0–9 und Bindestrich, 2–20
 * Zeichen.
 *
 * @param {string} name
 * @param {string[]} takenCodes
 */
export function codeFromName(name, takenCodes = []) {
  const plain = name
    .toUpperCase()
    .replace(/Ä/g, 'AE')
    .replace(/Ö/g, 'OE')
    .replace(/Ü/g, 'UE')
    .replace(/ß/g, 'SS')
    .normalize('NFD')
    .replace(/[^A-Z0-9 ]/g, ' ');
  const words = plain.split(/\s+/).filter(Boolean);

  // Zahlen bleiben ganz („Herren 2" -> „H2"), Wörter liefern ihren Anfangsbuchstaben.
  let base = words.map((word) => (/^\d+$/.test(word) ? word : word[0])).join('');
  if (base.length < 2) base = words.join('').slice(0, 10);
  if (base.length < 2) base = 'TEAM';
  base = base.slice(0, 16);

  const taken = new Set(takenCodes);
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base}-${n}`;
  return code;
}
