-- ============================================================================
--  Migration 006 – Verwaltungsbereich (Archiv, Mannschafts-Stammdaten)
-- ----------------------------------------------------------------------------
--  Grundlage für die überarbeitete Verwaltung (/admin):
--
--    news.is_archived        Beiträge werden archiviert statt gelöscht. Das
--                            Archiv bleibt vollständig lesbar; das Bild bleibt
--                            liegen, weil der Beitrag jederzeit zurückgeholt
--                            werden kann.
--
--    teams.age_group         Altersklasse ("A-Jugend", "Erwachsene", …)
--    teams.gender            Geschlecht der Mannschaft
--    teams.sort_order        Anzeigereihenfolge im ganzen Frontend
--
--  Die drei team-Spalten braucht das Formular "Neue Mannschaft anlegen".
--  Bisher wurden Mannschaften ausschliesslich per Seed in 001 angelegt und
--  überall nach `id` sortiert – mit `sort_order` lässt sich die Reihenfolge
--  pflegen, ohne IDs zu vergeben.
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  news – Archiv statt harter Löschung
-- ----------------------------------------------------------------------------
ALTER TABLE news
  ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Archiviert (1) oder aktiv (0). Archivierte Beiträge verschwinden aus dem Dashboard-Feed, bleiben in der Verwaltung unter "Archiv" aber vollständig erhalten und lassen sich zurückholen. Endgültiges Löschen bleibt als getrennte, bewusste Aktion bestehen.'
    AFTER image_path;

-- Der Feed liest ausschliesslich `is_archived = 0` und sortiert nach
-- created_at DESC – dieser zusammengesetzte Index bedient beides in einem
-- Zugriff (der bisherige idx_news_created greift nach dem WHERE nicht mehr).
ALTER TABLE news
  ADD KEY idx_news_archived_created (is_archived, created_at);


-- ----------------------------------------------------------------------------
--  teams – Stammdaten für neu angelegte Mannschaften
-- ----------------------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN age_group VARCHAR(40) DEFAULT NULL
    COMMENT 'Altersklasse / Jugend, z. B. "A-Jugend", "Minis" oder "Erwachsene". Frei formulierbar, weil die Verbände die Bezeichnungen regelmäßig ändern. NULL = nicht angegeben.'
    AFTER name;

ALTER TABLE teams
  ADD COLUMN gender ENUM('male','female','mixed') DEFAULT NULL
    COMMENT 'Geschlecht der Mannschaft: male = männlich | female = weiblich | mixed = gemischt. NULL = nicht angegeben.'
    AFTER age_group;

ALTER TABLE teams
  ADD COLUMN sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Anzeigereihenfolge im Frontend, kleinste Zahl zuerst. Bei Gleichstand entscheidet der Name. Ersetzt die bisherige Sortierung nach `id`.'
    AFTER gender;

-- Backfill: bestehende Reihenfolge (nach id) beibehalten, aber in Zehner-
-- schritten, damit sich später bequem etwas dazwischenschieben lässt.
UPDATE teams SET sort_order = id * 10 WHERE sort_order = 0;

ALTER TABLE teams
  ADD KEY idx_teams_sort (sort_order, name);
