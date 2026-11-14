-- ============================================================================
--  Migration 030 – Infothek (Modul backend/library/)
-- ----------------------------------------------------------------------------
--  Ein Datenmodell für drei Bereiche aus dem Lastenheft:
--
--    scope = 'board'    Schwarzes Brett (2.5): dauerhafte Vereinsinfos wie
--                       Beitrittsanträge, Hallenordnung, Hallenaufbau
--    scope = 'team'     Mannschaftsbereich (2.6): Playbook, Trainingsziele,
--                       Positionserklärungen – je Mannschaft (team_id)
--    scope = 'trainer'  Trainerbereich (2.7): vereinsweite Wissensdatenbank
--                       für alle Trainer:innen, ohne Mannschaftstrennung
--
--    library_entries   ein Eintrag: Titel, Text, Kategorie, optionaler Link
--    library_files     Dateien eines Eintrags (PDF, Bilder, Office, Video)
--
--  Die Dateien liegen unter backend/uploads/library/ und werden nur über
--  /api/library/entries/:id/files/:fileId mit Rechteprüfung ausgeliefert.
--
--  Entfernen:
--    DROP TABLE IF EXISTS library_files, library_entries
--    DELETE FROM schema_migrations WHERE filename = '030_infothek.sql'
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_entries (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope       ENUM('board','team','trainer') NOT NULL
              COMMENT 'board = Schwarzes Brett | team = Mannschaftsbereich | trainer = Trainerbereich',
  team_id     INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> teams.id. Nur bei scope = team gesetzt.',
  category    VARCHAR(60) DEFAULT NULL
              COMMENT 'Frei wählbare Rubrik, z. B. Anträge, Hallenordnung, Playbook, Übungen',
  title       VARCHAR(160) NOT NULL,
  body        TEXT DEFAULT NULL
              COMMENT 'Reiner Text (nie HTML). Zeilenumbrüche bleiben erhalten.',
  link_url    VARCHAR(500) DEFAULT NULL
              COMMENT 'Optionaler Verweis (https), z. B. auf ein Video oder ein Formular',
  link_label  VARCHAR(80) DEFAULT NULL,
  is_pinned   TINYINT(1) NOT NULL DEFAULT 0
              COMMENT 'Angeheftete Einträge stehen oben',
  created_by  INT UNSIGNED DEFAULT NULL,
  updated_by  INT UNSIGNED DEFAULT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_library_scope (scope, team_id, is_pinned, updated_at),
  CONSTRAINT fk_library_entries_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_entries_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_library_entries_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Infothek: Schwarzes Brett, Mannschaftsbereich und Trainerbereich.';

CREATE TABLE IF NOT EXISTS library_files (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id       INT UNSIGNED NOT NULL COMMENT 'FK -> library_entries.id',
  file_path      VARCHAR(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. library/ab12.pdf',
  mime_type      VARCHAR(100) NOT NULL,
  original_name  VARCHAR(160) DEFAULT NULL COMMENT 'Nur Anzeige- und Download-Name, nie als Pfad benutzt',
  size_bytes     INT UNSIGNED NOT NULL,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_library_files_entry (entry_id, sort_order),
  CONSTRAINT fk_library_files_entry FOREIGN KEY (entry_id) REFERENCES library_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dateien eines Infothek-Eintrags.';
