-- ============================================================================
--  Migration 021 – Trainer-Nachrichten, Lieblingsmannschaften, Startseite
-- ----------------------------------------------------------------------------
--    messages            Nachricht von Trainer:in / Verwaltung (Modul backend/messages/)
--    message_recipients  wer sie bekommt und wann gelesen (Lesebestätigung)
--    team_favorites      persönliche Lieblingsmannschaften (Reiter „Teams")
--    users.home_layout   Aufbau der Startseite (JSON: Reihenfolge + ausgeblendete Kacheln)
--
--  Entfernen:
--    DROP TABLE IF EXISTS message_recipients, messages, team_favorites;
--    ALTER TABLE users DROP COLUMN home_layout;
--    DELETE FROM schema_migrations WHERE filename = '021_messages_favorites_home.sql';
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id   INT UNSIGNED DEFAULT NULL COMMENT 'FK -> users.id, NULL wenn das Konto gelöscht wurde',
  team_id     INT UNSIGNED DEFAULT NULL COMMENT 'Mannschaft, aus der heraus geschrieben wurde. NULL = vereinsweit',
  audience    ENUM('team','players','coaches','selected','club') NOT NULL
              COMMENT 'team = Kader + Trainerteam | players | coaches | selected = einzelne Personen | club = alle Mitglieder',
  subject     VARCHAR(120) NOT NULL,
  body        TEXT NOT NULL COMMENT 'Reiner Text, wird nie als HTML dargestellt',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_messages_author (author_id, created_at),
  KEY idx_messages_team (team_id, created_at),
  CONSTRAINT fk_messages_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Nachrichten von Trainer:innen und Verwaltung.';

CREATE TABLE IF NOT EXISTS message_recipients (
  message_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  read_at     DATETIME DEFAULT NULL COMMENT 'Zuerst geöffnet (Ortszeit). NULL = ungelesen',

  PRIMARY KEY (message_id, user_id),
  KEY idx_recipients_user (user_id, read_at),
  CONSTRAINT fk_recipients_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Empfänger:innen einer Nachricht samt Lesestatus.';

CREATE TABLE IF NOT EXISTS team_favorites (
  user_id     INT UNSIGNED NOT NULL,
  team_id     INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id, team_id),
  KEY idx_team_favorites_team (team_id),
  CONSTRAINT fk_team_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_favorites_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lieblingsmannschaften je Person.';

ALTER TABLE users
  ADD COLUMN home_layout VARCHAR(500) DEFAULT NULL
      COMMENT 'Startseite als JSON, z. B. {"order":["next","calendar"],"hidden":["news"]}. NULL = Standard'
      AFTER theme;
