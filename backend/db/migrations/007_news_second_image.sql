-- ============================================================================
--  Migration 007 – Zweites Bild je Beitrag
-- ----------------------------------------------------------------------------
--  Ein Beitrag darf jetzt ZWEI Bilder tragen (vorher genau eines).
--
--  Warum eine zweite Spalte und keine eigene Tabelle `news_images`:
--  Die Obergrenze ist bewusst zwei – ein Schwarzes Brett ist keine Galerie.
--  Eine 1:n-Tabelle würde für diesen festen, kleinen Fall einen JOIN, eine
--  Sortierspalte und eigene Aufräum-Logik verlangen, ohne dass irgendetwas
--  davon gebraucht wird. Wird daraus später doch eine echte Bilderstrecke,
--  ist der Umbau eine Migration, die beide Spalten in Zeilen überführt.
--
--  Der Aufräum-Lauf (`npm run uploads:sweep`) liest beide Spalten, damit ein
--  zweites Bild nicht fälschlich als verwaist gilt und gelöscht wird.
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;

ALTER TABLE news
  ADD COLUMN image_path_2 VARCHAR(255) DEFAULT NULL
    COMMENT 'Zweites Beitragsbild, relativer Pfad in backend/uploads/ (z. B. "news/ab12cd34.jpg"). NULL = kein zweites Bild. Kann nur gesetzt sein, wenn auch image_path gesetzt ist – die Oberfläche füllt die Plätze der Reihe nach.'
    AFTER image_path;
