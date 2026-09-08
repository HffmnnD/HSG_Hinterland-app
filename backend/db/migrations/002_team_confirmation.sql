-- ============================================================================
--  Migration 002 – Team-spezifische Bestätigung statt globaler Admin-Freigabe
-- ----------------------------------------------------------------------------
--  * Konten sind nach der Registrierung sofort aktiv (keine Admin-Freigabe).
--  * Stattdessen bestätigt der/die Trainer:in die Zugehörigkeit zur Mannschaft.
--
--  Enthält einen einmaligen Daten-Backfill – wird dank `schema_migrations`
--  garantiert nur ein einziges Mal ausgeführt.
-- ============================================================================

USE hsg_hinterland;

-- --- 1) Globale Freigabe abschaffen ---------------------------------------

-- Standard auf "aktiv". `is_approved` bleibt als reine Admin-Notbremse
-- erhalten, wird aber beim Login/Session-Check NICHT mehr geprüft.
ALTER TABLE users
  MODIFY COLUMN is_approved TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'Konto aktiv (1) oder von einem Admin gesperrt (0). Standard 1. Es gibt keine globale Registrierungs-Freigabe mehr.';

-- Bisher nicht freigegebene Bestandskonten aktivieren.
UPDATE users SET is_approved = 1 WHERE is_approved = 0;

-- --- 2) Bestätigung der Mannschafts-Zugehörigkeit -----------------------

ALTER TABLE user_teams
  ADD COLUMN is_confirmed TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Vom Trainer bestätigt (1) oder offene Beitrittsanfrage (0). player/coach starten mit 0, fan wird direkt mit 1 angelegt.'
  AFTER relation_type;

-- Backfill: alles, was vor dieser Migration existierte, gilt als bestätigt
-- (es gab damals noch keine Anfragen-Logik). Läuft nur dieses eine Mal.
UPDATE user_teams SET is_confirmed = 1;
