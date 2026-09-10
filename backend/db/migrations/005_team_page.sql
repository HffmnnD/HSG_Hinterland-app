-- ============================================================================
--  Migration 005 – Mannschaftsseite („Fan-Seite")
-- ----------------------------------------------------------------------------
--  Ergänzt die Stammdaten, die die überarbeitete Mannschaftsseite anzeigt:
--
--    teams.handball_team_id  Verknüpfung zur Liga (nuLiga/HHV) -> Tabelle,
--                            Spielplan und Live-Ticker
--    teams.photo_path        Mannschaftsfoto für den Kopfbereich
--    team_sponsors           Haupt-Sponsoren der Mannschaft
--    user_teams.jersey_number / position / staff_title
--                            Kaderangaben je Mannschaft
--
--  Warum die Kaderangaben an `user_teams` hängen und nicht an `users`:
--  Eine Person kann in mehreren Mannschaften spielen – mit unterschiedlicher
--  Rückennummer und auf unterschiedlicher Position (in der A-Jugend Rückraum,
--  bei den Herren Außen). An `users` wäre nur EIN Wert möglich, und der wäre
--  in mindestens einer Mannschaft falsch.
--
--      teams ──1:n──> team_sponsors
--      user_teams (+ jersey_number, position, staff_title)
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  teams – Ligaverknüpfung und Mannschaftsfoto
-- ----------------------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN handball_team_id VARCHAR(20) DEFAULT NULL
    COMMENT 'nuLiga-Mannschaftsnummer (`teamtable`, rein numerisch, z. B. "2086554"). Steht in der URL der Mannschaftsseite auf hhv-handball.liga.nu. NULL = Mannschaft spielt (noch) keine Ligaspiele oder die Saison ist nicht terminiert -> die App zeigt statt Tabelle/Spielplan einen Hinweis.'
    AFTER name;

ALTER TABLE teams
  ADD COLUMN photo_path VARCHAR(255) DEFAULT NULL
    COMMENT 'Relativer Pfad des Mannschaftsfotos innerhalb von backend/uploads/, z. B. "teams/ab12cd34.jpg". Ausgeliefert über /api/uploads/<pfad>. NULL = kein Foto, der Kopfbereich zeigt dann eine gestaltete Fläche.'
    AFTER handball_team_id;


-- ----------------------------------------------------------------------------
--  team_sponsors – Haupt-Sponsoren einer Mannschaft
-- ----------------------------------------------------------------------------
--  Bewusst eine eigene Tabelle statt einer Textspalte: Sponsoren kommen und
--  gehen einzeln, brauchen eine Reihenfolge und je einen eigenen Link.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_sponsors (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',

  team_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> teams.id',

  name        VARCHAR(100) NOT NULL
              COMMENT 'Name des Sponsors, wie er auf der Mannschaftsseite steht',

  website_url VARCHAR(255) DEFAULT NULL
              COMMENT 'Optionale Website des Sponsors (nur http/https). NULL = nicht verlinkt.',

  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0
              COMMENT 'Anzeigereihenfolge, kleinste Zahl zuerst. Haupt-Sponsor also 0.',

  PRIMARY KEY (id),
  KEY idx_team_sponsors_team (team_id, sort_order),

  CONSTRAINT fk_team_sponsors_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sponsoren je Mannschaft für den Kopfbereich der Mannschaftsseite. ON DELETE CASCADE.';


-- ----------------------------------------------------------------------------
--  user_teams – Kaderangaben
-- ----------------------------------------------------------------------------
ALTER TABLE user_teams
  ADD COLUMN jersey_number TINYINT UNSIGNED DEFAULT NULL
    COMMENT 'Rückennummer in DIESER Mannschaft (1-99). NULL = keine feste Nummer, die Kaderkarte zeigt dann die Initialen.'
    AFTER relation_type;

ALTER TABLE user_teams
  ADD COLUMN position ENUM('tor','rueckraum','aussen','kreis') DEFAULT NULL
    COMMENT 'Spielposition in DIESER Mannschaft: tor = Torwart:in | rueckraum = Rückraum | aussen = Außen | kreis = Kreisläufer:in. NULL = nicht angegeben (Kaderfilter zeigt die Karte trotzdem unter "Alle").'
    AFTER jersey_number;

ALTER TABLE user_teams
  ADD COLUMN staff_title VARCHAR(60) DEFAULT NULL
    COMMENT 'Freie Bezeichnung im Trainer-/Betreuerstab, z. B. "Co-Trainer" oder "Betreuerin". Nur für relation_type = coach sinnvoll. NULL -> die Seite zeigt schlicht "Trainer:in".'
    AFTER position;
