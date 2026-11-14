-- ============================================================================
--  Migration 033 – News: Zielgruppen, Dokumente, Videos und Links
-- ----------------------------------------------------------------------------
--  Lastenheft 2.2: News als Texte, Bilder, Videos, Dokumente und ggf.
--  Livestream-Links. Beiträge können für einzelne oder mehrere Mannschaften
--  veröffentlicht werden.
--
--    news.audience    club = alle Mitglieder | teams = nur news_teams
--    news.link_url    Verweis, z. B. auf einen Livestream (https)
--    news.link_kind   steuert Beschriftung und Symbol des Verweises
--    news_teams       Zielgruppe bei audience = teams
--    news_files       Dokumente (PDF, Office) und Videos (MP4, WEBM)
--
--  Bilder bleiben in news_images. Die Dateien aus news_files liegen unter
--  backend/uploads/news-files/ und werden nur über /api/news/:id/files/:fileId
--  ausgeliefert – mit Prüfung, ob die Person den Beitrag sehen darf.
--
--  Entfernen:
--    DROP TABLE IF EXISTS news_files, news_teams
--    ALTER TABLE news DROP COLUMN audience, DROP COLUMN link_url, DROP COLUMN link_kind
--    DELETE FROM schema_migrations WHERE filename = '033_news_zielgruppen_und_anhaenge.sql'
-- ============================================================================

ALTER TABLE news
  ADD COLUMN audience ENUM('club','teams') NOT NULL DEFAULT 'club'
    COMMENT 'club = alle Mitglieder | teams = nur die Mannschaften aus news_teams';

ALTER TABLE news
  ADD COLUMN link_url VARCHAR(500) DEFAULT NULL
    COMMENT 'Optionaler Verweis (https), z. B. Livestream';

ALTER TABLE news
  ADD COLUMN link_kind ENUM('link','livestream','video') NOT NULL DEFAULT 'link'
    COMMENT 'Art des Verweises – bestimmt Beschriftung und Symbol';

CREATE TABLE IF NOT EXISTS news_teams (
  news_id  INT UNSIGNED NOT NULL,
  team_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (news_id, team_id),
  KEY idx_news_teams_team (team_id),
  CONSTRAINT fk_news_teams_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
  CONSTRAINT fk_news_teams_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Mannschaften, für die ein Beitrag veröffentlicht wurde.';

CREATE TABLE IF NOT EXISTS news_files (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  news_id        INT UNSIGNED NOT NULL COMMENT 'FK -> news.id',
  file_path      VARCHAR(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. news-files/ab12.pdf',
  mime_type      VARCHAR(100) NOT NULL,
  original_name  VARCHAR(160) DEFAULT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_news_files_news (news_id, sort_order),
  CONSTRAINT fk_news_files_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dokumente und Videos eines Beitrags.';
