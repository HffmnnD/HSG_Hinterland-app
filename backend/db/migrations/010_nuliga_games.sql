-- ============================================================================
--  Migration 010 – Ligaspiele aus nuLiga im Kalender
-- ----------------------------------------------------------------------------
--  Hat eine Mannschaft eine nuLiga-Nummer hinterlegt (`teams.handball_team_id`,
--  siehe Migration 005), kann ihr Spielplan in den Kalender übernommen werden.
--
--  Die Spiele werden dabei als ECHTE Termine in `events` angelegt (type
--  'MATCH') und nicht nur eingeblendet. Nur so gilt für sie dasselbe wie für
--  jedes Training: Spieler:innen können sich abmelden, das Trainerteam sieht
--  den Kader, und die Beteiligung lässt sich getrennt nach Training und
--  Spielen auswerten.
--
--    teams.nuliga_sync_enabled  Schalter je Mannschaft (Standard: aus)
--    teams.nuliga_synced_at     wann zuletzt abgeglichen
--    events.nuliga_game_id      Herkunft des Termins; verhindert Doppelte
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  teams – Schalter und Zeitstempel des Abgleichs
-- ----------------------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN nuliga_sync_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Sollen die Ligaspiele aus nuLiga als Termine im Kalender stehen? Standard aus – eine Mannschaft ohne Ligabetrieb soll nicht plötzlich fremde Spiele anzeigen. Wird im Planungsbereich vom Trainerteam gesetzt.'
    AFTER photo_path;

ALTER TABLE teams
  ADD COLUMN nuliga_synced_at DATETIME DEFAULT NULL
    COMMENT 'Zeitpunkt des letzten erfolgreichen Abgleichs mit nuLiga (Ortszeit). NULL = noch nie abgeglichen. Steuert, wann im Hintergrund erneut geholt wird.'
    AFTER nuliga_sync_enabled;


-- ----------------------------------------------------------------------------
--  events – Herkunft aus nuLiga
-- ----------------------------------------------------------------------------
--  Die Spiel-ID stammt aus dem Spielplan (zusammengesetzt aus meeting, group
--  und championship). Zusammen mit der Mannschaft ist sie eindeutig – daraus
--  wird ein UNIQUE-Index, damit ein erneuter Abgleich denselben Termin
--  aktualisiert statt ihn ein zweites Mal anzulegen.
--
--  Verlegt der Verband ein Spiel, ändert sich nur `start_time` des vorhandenen
--  Termins. Die bereits abgegebenen Rückmeldungen bleiben damit erhalten.
-- ----------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN nuliga_game_id VARCHAR(64) DEFAULT NULL
    COMMENT 'Spiel-ID aus dem nuLiga-Spielplan, wenn dieser Termin von dort übernommen wurde. NULL = von Hand angelegt. Von Hand angelegte Termine fasst der Abgleich nie an.'
    AFTER series_id;

ALTER TABLE events
  ADD UNIQUE KEY uq_events_nuliga (team_id, nuliga_game_id);
