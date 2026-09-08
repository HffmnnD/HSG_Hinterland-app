// Beteiligungsarten im Registrierungsformular, Beziehungstypen zu
// Mannschaften und Helferdienste.

/**
 * Auswahlmöglichkeiten bei der Registrierung.
 * `relationType` verknüpft die Auswahl mit `user_teams.relation_type`.
 */
export const PARTICIPATION_OPTIONS = [
  {
    key: 'spieler',
    label: 'Spieler:in',
    hint: 'Du spielst aktiv in einer oder mehreren Mannschaften.',
    relationType: 'player',
  },
  {
    key: 'trainer',
    label: 'Trainer:in',
    hint: 'Du trainierst eine oder mehrere Mannschaften.',
    relationType: 'coach',
  },
  {
    key: 'mitwirkender',
    label: 'Mitwirkende:r',
    hint: 'Du übernimmst Helferdienste – beinhaltet automatisch „Zuschauer:in“.',
    relationType: null,
  },
  {
    key: 'zuschauer',
    label: 'Zuschauer:in',
    hint: 'Du verfolgst die Spiele bestimmter Mannschaften.',
    relationType: 'fan',
  },
];

// „Mitwirkende:r“ schließt „Zuschauer:in“ zwingend mit ein.
export const IMPLIES = { mitwirkender: ['zuschauer'] };

export const SERVICE_TYPES = ['zeitnehmer', 'verkaufsdienst'];

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

export function relationLabel(relationType) {
  return RELATION_LABELS[relationType] ?? relationType;
}

export function relationLabelPlural(relationType) {
  return RELATION_LABELS_PLURAL[relationType] ?? relationType;
}
