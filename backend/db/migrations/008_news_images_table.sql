-- ============================================================================
--  Migration 008 – Beliebig viele Bilder je Beitrag
-- ----------------------------------------------------------------------------
--  Migration 007 hatte ein zweites Bild als eigene Spalte ergänzt, mit der
--  ausdrücklichen Begründung: „Wird daraus später doch eine echte
--  Bilderstrecke, ist der Umbau eine Migration, die beide Spalten in Zeilen
--  überführt." Genau das passiert hier.
--
--  Ab jetzt hängen die Bilder in einer 1:n-Tabelle. Die Zahl der Bilder je
--  Beitrag ist damit im Schema unbegrenzt; begrenzt wird nur noch, wie viele
--  Dateien EIN Upload-Request mitbringen darf (siehe config/uploads.js) –
--  das ist eine Frage der Lastabwehr, nicht des Datenmodells.
--
--      news ──1:n──> news_images   (ON DELETE CASCADE)
--
--  Reihenfolge der Migration (wichtig): erst Tabelle anlegen, dann die
--  Bestandsdaten übernehmen, DANN die alten Spalten entfernen. Andersherum
--  wären die Pfade weg.
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  news_images – Bilder eines Beitrags in Anzeigereihenfolge
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_images (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',

  news_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> news.id. Wird der Beitrag gelöscht, verschwinden die Zeilen mit (ON DELETE CASCADE). Die DATEIEN räumt der Controller weg – dafür liest er die Pfade vor dem Löschen aus.',

  image_path  VARCHAR(255) NOT NULL
              COMMENT 'Relativer Pfad innerhalb von backend/uploads/, z. B. "news/ab12cd34.jpg". Ausgeliefert über /api/uploads/<pfad>.',

  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0
              COMMENT 'Anzeigereihenfolge innerhalb des Beitrags, kleinste Zahl zuerst. Vergibt der Server beim Anlegen (0, 1, 2 …).',

  PRIMARY KEY (id),
  KEY idx_news_images_news (news_id, sort_order),

  CONSTRAINT fk_news_images_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bilder eines Vereins-Beitrags. Beliebig viele je Beitrag, Reihenfolge über sort_order.';


-- ----------------------------------------------------------------------------
--  Bestandsdaten übernehmen (läuft dank schema_migrations genau einmal)
-- ----------------------------------------------------------------------------
INSERT INTO news_images (news_id, image_path, sort_order)
  SELECT id, image_path, 0 FROM news WHERE image_path IS NOT NULL;

INSERT INTO news_images (news_id, image_path, sort_order)
  SELECT id, image_path_2, 1 FROM news WHERE image_path_2 IS NOT NULL;


-- ----------------------------------------------------------------------------
--  Alte Spalten entfernen – erst jetzt, nachdem die Pfade übernommen sind
-- ----------------------------------------------------------------------------
ALTER TABLE news DROP COLUMN image_path_2;
ALTER TABLE news DROP COLUMN image_path;
