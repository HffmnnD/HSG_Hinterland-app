-- ============================================================================
--  Migration 022 – Spielberichte (Uploads) und beobachtete Ticker-Uhrzeiten
-- ----------------------------------------------------------------------------
--    match_reports        hochgeladener Spielbericht einer Mannschaft
--                         (optional mit dem nuLiga-/nuScoreLive-Spiel verknüpft)
--    match_report_files   Dateien eines Berichts (PDF und Bilder)
--    ticker_event_times   Wann hat der Server eine Ticker-Aktion live gesehen?
--                         nuScoreLive liefert nur Spielsekunden, keine Uhrzeit –
--                         die echte Uhrzeit („18:02 Uhr") kennt nur, wer live
--                         dabei war. Gespeichert wird ausschließlich, was das
--                         Backend wirklich live empfangen hat.
--
--  Entfernen:
--    DROP TABLE IF EXISTS match_report_files, match_reports, ticker_event_times;
--    DELETE FROM schema_migrations WHERE filename = '022_spielberichte_und_ticker_zeiten.sql';
-- ============================================================================

CREATE TABLE IF NOT EXISTS match_reports (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id       INT UNSIGNED NOT NULL COMMENT 'FK -> teams.id',
  meeting_id    VARCHAR(12) DEFAULT NULL COMMENT 'nuLiga-/nuScoreLive-Spielnummer (meeting), NULL = ohne Verknüpfung',
  game_id       VARCHAR(160) DEFAULT NULL COMMENT 'App-Spiel-ID (meeting.group.championship) für den Link zur Spielseite',
  game_date     DATE NOT NULL COMMENT 'Spieltag',
  opponent      VARCHAR(120) NOT NULL,
  is_home       TINYINT(1) DEFAULT NULL COMMENT '1 = Heimspiel, 0 = Auswärtsspiel, NULL = unbekannt',
  title         VARCHAR(160) NOT NULL,
  summary       VARCHAR(2000) DEFAULT NULL COMMENT 'Kurzer Text, reiner Text (nie HTML)',
  uploaded_by   INT UNSIGNED DEFAULT NULL COMMENT 'FK -> users.id, NULL wenn das Konto gelöscht wurde',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_match_reports_team_date (team_id, game_date),
  KEY idx_match_reports_meeting (meeting_id),
  CONSTRAINT fk_match_reports_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_reports_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Von Trainer:innen hochgeladene Spielberichte je Mannschaft.';

CREATE TABLE IF NOT EXISTS match_report_files (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id      INT UNSIGNED NOT NULL COMMENT 'FK -> match_reports.id',
  file_path      VARCHAR(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. match-reports/ab12….pdf',
  mime_type      VARCHAR(50) NOT NULL,
  original_name  VARCHAR(160) DEFAULT NULL COMMENT 'Nur zur Anzeige/zum Download-Namen, nie als Pfad benutzt',
  size_bytes     INT UNSIGNED NOT NULL,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_match_report_files_report (report_id, sort_order),
  CONSTRAINT fk_match_report_files_report FOREIGN KEY (report_id) REFERENCES match_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dateien (PDF/Bilder) eines Spielberichts.';

CREATE TABLE IF NOT EXISTS ticker_event_times (
  meeting_id    VARCHAR(12) NOT NULL COMMENT 'nuScoreLive-Spielnummer',
  event_idx     INT UNSIGNED NOT NULL COMMENT 'Laufende Nummer der Aktion (idx) bei nuScoreLive',
  event_code    TINYINT UNSIGNED DEFAULT NULL COMMENT 'nuScoreLive-Ereigniscode (0–19) zur Kontrolle',
  observed_at   DATETIME(3) NOT NULL COMMENT 'Empfangszeit beim Backend (UTC)',
  source        ENUM('push','rest') NOT NULL COMMENT 'push = per WebSocket, rest = beim ersten Abruf während des Spiels',

  PRIMARY KEY (meeting_id, event_idx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Live beobachtete Uhrzeit je Ticker-Aktion (nur was wirklich live empfangen wurde).';
