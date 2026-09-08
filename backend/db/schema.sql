-- Datenbankschema für die Authentifizierung der HSG Hinterland App.
-- In phpMyAdmin auf der Datenbank `hsg_hinterland` ausführen.

CREATE DATABASE IF NOT EXISTS hsg_hinterland
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hsg_hinterland;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name     VARCHAR(100)  NOT NULL,
  last_name      VARCHAR(100)  NOT NULL,
  email          VARCHAR(255)  NOT NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  is_approved    TINYINT(1)    NOT NULL DEFAULT 0,
  role           ENUM('admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer') NOT NULL DEFAULT 'spieler',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mannschaften
CREATE TABLE IF NOT EXISTS teams (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(100) NOT NULL,
  code  VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO teams (code, name) VALUES
  ('MJC', 'Männliche Jugend C'),
  ('MJB', 'Männliche Jugend B'),
  ('MJA', 'Männliche Jugend A'),
  ('H1',  '1. Herren'),
  ('H2',  '2. Herren'),
  ('D1',  'Damen')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Verknüpfung Nutzer <-> Mannschaften (n:m) inkl. Art der Beziehung.
-- Ein Nutzer kann pro Mannschaft mehrere Beziehungen haben, z. B. Trainer der
-- MJC und Spieler der 1. Herren.
CREATE TABLE IF NOT EXISTS user_teams (
  user_id        INT UNSIGNED NOT NULL,
  team_id        INT UNSIGNED NOT NULL,
  relation_type  ENUM('player', 'coach', 'fan') NOT NULL DEFAULT 'player',
  PRIMARY KEY (user_id, team_id, relation_type),
  KEY idx_user_teams_team (team_id),
  KEY idx_user_teams_user (user_id),
  CONSTRAINT fk_user_teams_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_teams_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Helferdienste der Mitwirkenden
CREATE TABLE IF NOT EXISTS user_services (
  user_id       INT UNSIGNED NOT NULL,
  service_type  ENUM('zeitnehmer', 'verkaufsdienst') NOT NULL,
  PRIMARY KEY (user_id, service_type),
  CONSTRAINT fk_user_services_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bestehende Datenbank nachträglich erweitern: `npm run migrate`
-- (führt db/migrations/*.sql aus).
