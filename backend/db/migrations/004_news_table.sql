-- ============================================================================
--  Migration 004 – Vereins-News / Ankündigungen
-- ----------------------------------------------------------------------------
--  Schwarzes Brett des Vereins: Admins und Sub-Admins veröffentlichen kurze
--  Beiträge (optional mit Bild), alle angemeldeten Mitglieder lesen sie auf
--  dem Dashboard.
--
--  Bilder liegen NICHT in der Datenbank, sondern im Dateisystem unter
--  backend/uploads/. Gespeichert wird nur der relative Pfad (z. B.
--  "news/1730f3c2ab.jpg"); ausgeliefert werden sie über /api/uploads/<pfad>.
--
--      users ──1:n──> news   (author_id, ON DELETE SET NULL)
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;

CREATE TABLE IF NOT EXISTS news (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel des Beitrags',

  title       VARCHAR(150) NOT NULL
              COMMENT 'Überschrift der Ankündigung (Pflicht, max. 150 Zeichen)',
  content     TEXT NOT NULL
              COMMENT 'Fließtext der Ankündigung (Pflicht). Wird als reiner Text gespeichert und im Frontend als Text gerendert – kein HTML.',

  image_path  VARCHAR(255) DEFAULT NULL
              COMMENT 'Relativer Pfad des Beitragsbilds innerhalb von backend/uploads/, z. B. "news/ab12cd34.jpg". NULL = Beitrag ohne Bild.',

  author_id   INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> users.id. Wer den Beitrag verfasst hat. NULL, wenn das Konto später gelöscht wurde (ON DELETE SET NULL) – der Beitrag bleibt erhalten.',

  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
              COMMENT 'Veröffentlichungszeitpunkt. Sortierkriterium im News-Feed (absteigend).',
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
              COMMENT 'Letzte Änderung des Beitrags',

  PRIMARY KEY (id),
  KEY idx_news_created (created_at),
  KEY idx_news_author (author_id),

  CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Vereins-News und Ankündigungen. Erstellen/Löschen nur admin & sub_admin, Lesen alle angemeldeten Mitglieder.';
