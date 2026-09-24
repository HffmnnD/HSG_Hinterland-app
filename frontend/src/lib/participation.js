// Beteiligungsarten (Onboarding & „Mein Konto"), Beziehungstypen zu
// Mannschaften und Helferdienste.

/**
 * Die drei Fragen des Onboarding-Assistenten und des Einstellungsbereichs:
 * Spielst du? Trainierst du? Schaust du zu?
 *
 * Jede Antwort führt zu genau EINEM Beziehungstyp in `user_teams` – deshalb
 * ist `relationType` hier der Schlüssel und nicht ein zusätzliches Kürzel.
 * Mehrfachauswahl ist der Normalfall: Trainer:innen spielen oft selbst, und
 * wer nur zuschaut, tut das meist bei mehreren Mannschaften.
 *
 * Die frühere Option „Mitwirkende:r" (Helferdienste) steht bewusst nicht mehr
 * hier: Sie beantwortete keine Frage über die eigene Beteiligung an einer
 * Mannschaft, sondern öffnete ein weiteres Formular – und sie hat die
 * Zuschauer-Option zwangsweise mitaktiviert, was niemand erwartet hat.
 * Helferdienste pflegt die Verwaltung.
 */
export const PARTICIPATION_OPTIONS = [
  {
    relationType: 'player',
    question: 'Bist du aktive:r Spieler:in?',
    label: 'Spieler:in',
    hint: 'Du trainierst und spielst in einer oder mehreren Mannschaften.',
    teamPrompt: 'In welchen Mannschaften spielst du?',
    needsConfirmation: true,
  },
  {
    relationType: 'coach',
    question: 'Bist du Trainer:in?',
    label: 'Trainer:in',
    hint: 'Du leitest das Training einer oder mehrerer Mannschaften.',
    teamPrompt: 'Welche Mannschaften trainierst du?',
    needsConfirmation: true,
  },
  {
    relationType: 'fan',
    question: 'Zuschauer:in oder Fan?',
    label: 'Zuschauer:in',
    hint: 'Du willst die Spieltermine bestimmter Mannschaften sehen.',
    teamPrompt: 'Welche Mannschaften interessieren dich?',
    needsConfirmation: false,
  },
];

export const SERVICE_LABELS = {
  zeitnehmer: 'Zeitnehmer',
  verkaufsdienst: 'Verkaufsdienst',
};

export function serviceLabel(service) {
  return SERVICE_LABELS[service] ?? service;
}

// Beziehung Nutzer <-> Mannschaft
export const RELATION_TYPES = ['player', 'coach', 'fan'];

export const RELATION_LABELS = {
  player: 'Spieler:in',
  coach: 'Trainer:in',
  fan: 'Fan',
};

// Plural für Überschriften
export const RELATION_LABELS_PLURAL = {
  player: 'Spieler:innen',
  coach: 'Trainer:innen',
  fan: 'Fans',
};

/**
 * Beschriftung aus der Sicht des angemeldeten Mitglieds („Meine
 * Mannschaften"). Dort steht die eigene Rolle über der Liste – „Fans" als
 * Überschrift über den eigenen Mannschaften wäre schlicht falsch.
 */
export const MY_RELATION_LABELS = {
  coach: 'Als Trainer:in',
  player: 'Als Spieler:in',
  fan: 'Verfolge ich',
};

export function myRelationLabel(relationType) {
  return MY_RELATION_LABELS[relationType] ?? relationLabel(relationType);
}

export function relationLabel(relationType) {
  return RELATION_LABELS[relationType] ?? relationType;
}

export function relationLabelPlural(relationType) {
  return RELATION_LABELS_PLURAL[relationType] ?? relationType;
}

// --------------------------------------------------------------- Positionen

/**
 * Spielpositionen im Handball (muss zum ENUM in `user_teams.position` passen).
 * Die vier Gruppen sind bewusst grob gehalten – für den Kader einer
 * Vereins-App reicht „Rückraum", die Unterscheidung RL/RM/RR gehört auf den
 * Spielberichtsbogen, nicht auf eine Fan-Seite.
 */
export const POSITIONS = ['tor', 'rueckraum', 'aussen', 'kreis'];

/** Kurzform für Filter-Chips und Kaderkarten. */
export const POSITION_LABELS = {
  tor: 'Tor',
  rueckraum: 'Rückraum',
  aussen: 'Außen',
  kreis: 'Kreis',
};

/** Ausgeschrieben für Auswahlfelder in der Verwaltung. */
export const POSITION_LABELS_LONG = {
  tor: 'Torwart:in',
  rueckraum: 'Rückraum',
  aussen: 'Außen',
  kreis: 'Kreisläufer:in',
};

export function positionLabel(position) {
  return POSITION_LABELS[position] ?? null;
}

export function positionLabelLong(position) {
  return POSITION_LABELS_LONG[position] ?? null;
}
