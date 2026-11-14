-- ============================================================================
--  Migration 032 – Vereinstermine mit Abfrage, Anmeldefrist für Termine
-- ----------------------------------------------------------------------------
--  Lastenheft 2.3:
--    „Der Kalender zeigt Vereinsveranstaltungen sowie die Termine der eigenen
--     Mannschaften an."  ->  club_events (Modul backend/clubEvents/)
--    „Die Anmeldefrist ist frei definierbar."  ->  response_deadline
--    „Ein Absagegrund kann freiwillig angegeben werden."  ->  keine
--     Schemaänderung nötig, attendances.reason durfte schon NULL sein. Die
--     Pflicht lag nur in der Eingabeprüfung und ist dort entfallen.
--
--    club_events           Veranstaltung des Vereins (Sommerfest, Helferabend,
--                          Mitgliederversammlung) – für alle oder für
--                          ausgewählte Mannschaften
--    club_event_teams      Zielgruppe bei audience = teams
--    club_event_responses  Rückmeldung je Person: dabei, vielleicht, nicht
--                          dabei – mit Begleitpersonen und Notiz
--
--  Anders als beim Training gilt hier NICHT „keine Antwort = dabei": Bei
--  einer Abfrage zählt nur, wer wirklich geantwortet hat.
--
--  Entfernen:
--    DROP TABLE IF EXISTS club_event_responses, club_event_teams, club_events
--    ALTER TABLE events DROP COLUMN response_deadline
--    ALTER TABLE event_series DROP COLUMN deadline_hours
--    DELETE FROM schema_migrations WHERE filename = '032_vereinstermine_und_fristen.sql'
-- ============================================================================

CREATE TABLE IF NOT EXISTS club_events (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title              VARCHAR(120) NOT NULL,
  description        VARCHAR(4000) DEFAULT NULL COMMENT 'Reiner Text',
  location           VARCHAR(150) DEFAULT NULL,
  start_time         DATETIME NOT NULL COMMENT 'Ortszeit',
  end_time           DATETIME NOT NULL COMMENT 'Ortszeit',
  audience           ENUM('club','teams') NOT NULL DEFAULT 'club'
                     COMMENT 'club = alle Mitglieder | teams = nur die Mannschaften aus club_event_teams',
  rsvp_enabled       TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Wird eine Rückmeldung abgefragt?',
  response_deadline  DATETIME DEFAULT NULL COMMENT 'Anmeldefrist (Ortszeit), NULL = bis zum Beginn',
  allow_guests       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Dürfen Begleitpersonen angemeldet werden?',
  max_participants   SMALLINT UNSIGNED DEFAULT NULL COMMENT 'Obergrenze inklusive Begleitpersonen, NULL = unbegrenzt',
  cancelled_at       DATETIME DEFAULT NULL,
  cancel_reason      VARCHAR(200) DEFAULT NULL,
  created_by         INT UNSIGNED DEFAULT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_club_events_start (start_time),
  CONSTRAINT fk_club_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Vereinsveranstaltungen mit optionaler Teilnahme-Abfrage.';

CREATE TABLE IF NOT EXISTS club_event_teams (
  event_id  INT UNSIGNED NOT NULL,
  team_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id, team_id),
  KEY idx_club_event_teams_team (team_id),
  CONSTRAINT fk_club_event_teams_event FOREIGN KEY (event_id) REFERENCES club_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_event_teams_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Mannschaften, an die sich ein Vereinstermin richtet.';

CREATE TABLE IF NOT EXISTS club_event_responses (
  event_id    INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('yes','maybe','no') NOT NULL,
  guests      TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Begleitpersonen zusätzlich zur Person selbst',
  note        VARCHAR(200) DEFAULT NULL,
  set_by      INT UNSIGNED DEFAULT NULL COMMENT 'Weicht ab, wenn Eltern für ihr Kind antworten',
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (event_id, user_id),
  KEY idx_club_event_responses_user (user_id),
  CONSTRAINT fk_club_event_responses_event FOREIGN KEY (event_id) REFERENCES club_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_event_responses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_club_event_responses_setter FOREIGN KEY (set_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rückmeldungen zu Vereinsterminen.';

ALTER TABLE events
  ADD COLUMN response_deadline DATETIME DEFAULT NULL
    COMMENT 'Anmeldefrist (Ortszeit). Danach ändern nur noch Trainer:innen die Rückmeldung. NULL = bis zum Ende des Termins.'
    AFTER reasons_visible_to_all;

ALTER TABLE event_series
  ADD COLUMN deadline_hours SMALLINT UNSIGNED DEFAULT NULL
    COMMENT 'Anmeldefrist der Serie in Stunden vor Beginn. NULL = keine Frist. Wird je Termin in events.response_deadline umgerechnet.'
    AFTER reasons_visible_to_all;
