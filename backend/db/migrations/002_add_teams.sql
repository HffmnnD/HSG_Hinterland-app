-- Migration: Mannschaftsverwaltung (Teams).
-- Idempotent – kann mehrfach ausgeführt werden.

USE hsg_hinterland;

-- Mannschaften
CREATE TABLE IF NOT EXISTS teams (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(100) NOT NULL,
  code  VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Standard-Mannschaften (Code ist eindeutig -> Re-Run aktualisiert nur den Namen)
INSERT INTO teams (code, name) VALUES
  ('MJC', 'Männliche Jugend C'),
  ('MJB', 'Männliche Jugend B'),
  ('MJA', 'Männliche Jugend A'),
  ('H1',  '1. Herren'),
  ('H2',  '2. Herren'),
  ('D1',  'Damen')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Verknüpfung Nutzer <-> Mannschaften (n:m)
CREATE TABLE IF NOT EXISTS user_teams (
  user_id  INT UNSIGNED NOT NULL,
  team_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, team_id),
  KEY idx_user_teams_team (team_id),
  CONSTRAINT fk_user_teams_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_teams_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
