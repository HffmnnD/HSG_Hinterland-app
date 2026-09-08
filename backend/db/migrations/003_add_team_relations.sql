-- Migration: Beziehungstyp zur Mannschaft (Spieler / Trainer / Fan).
-- Idempotent – kann mehrfach ausgeführt werden.

USE hsg_hinterland;

-- Bestehende Zuordnungen sind Spieler-Zuordnungen.
ALTER TABLE user_teams
  ADD COLUMN relation_type ENUM('player', 'coach', 'fan')
  NOT NULL DEFAULT 'player'
  AFTER team_id;

-- Eigener Index für user_id, damit der Fremdschlüssel unabhängig vom
-- Primärschlüssel bleibt (dieser wird gleich umgebaut).
ALTER TABLE user_teams
  ADD INDEX idx_user_teams_user (user_id);

-- Ein Nutzer kann pro Mannschaft mehrere Beziehungen haben
-- (z. B. Trainer der MJC und gleichzeitig Spieler der 1. Herren).
ALTER TABLE user_teams
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (user_id, team_id, relation_type);
