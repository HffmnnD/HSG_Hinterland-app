-- ============================================================================
--  Migration 009 – Trainings- und Terminverwaltung („Termine")
-- ----------------------------------------------------------------------------
--  Vier neue Tabellen:
--
--    event_series         Regel einer wiederkehrenden Trainingsserie
--                         (z. B. "Di + Do, 19:00-20:30, Halle West")
--    events               EIN konkreter Termin mit Datum und Uhrzeit
--    attendances          ausdrückliche Zu-/Absage einer Person zu EINEM Termin
--    long_term_absences   Urlaub / Verletzung über einen Zeitraum
--
--  Beziehungen:
--
--      teams ──1:n──> event_series ──1:n──> events ──1:n──> attendances
--      teams ──1:n──> events                 users ──1:n──> attendances
--      users ──1:n──> long_term_absences <──n:1── teams
--
--  Warum die Serie MATERIALISIERT wird (jede Trainingseinheit als eigene Zeile
--  in `events`) und nicht nur als Regel gespeichert:
--  An einem Termin hängen Rückmeldungen, und die Historie muss Jahre später
--  noch beantworten können "war Person X am 01.01.2026 beim Training?". Eine
--  reine Regel ließe sich nachträglich ändern – die Vergangenheit wäre damit
--  umgeschrieben. Die Regel in `event_series` bleibt trotzdem erhalten, damit
--  der/die Trainer:in die Serie als Ganzes bearbeiten und beenden kann.
--
--  Kein Eintrag in `attendances` bedeutet ZUGESAGT. Das ist der Normalfall im
--  Training – so muss nur melden, wer NICHT kommt (siehe db/README.md).
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  event_series – Regel einer wiederkehrenden Trainingsserie
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_series (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT
               COMMENT 'Primärschlüssel, wird von events.series_id referenziert',

  team_id      INT UNSIGNED NOT NULL
               COMMENT 'FK -> teams.id. Die Serie gehört genau einer Mannschaft.',

  title        VARCHAR(120) NOT NULL
               COMMENT 'Bezeichnung der Serie, z. B. "Training". Wird auf jeden erzeugten Termin übernommen.',

  type         ENUM('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH')
               NOT NULL DEFAULT 'REGULAR_TRAINING'
               COMMENT 'Terminart der erzeugten Einheiten. Für Serien praktisch immer REGULAR_TRAINING.',

  location     VARCHAR(120) DEFAULT NULL
               COMMENT 'Halle / Treffpunkt, z. B. "Halle West". NULL = noch offen.',

  weekdays     TINYINT UNSIGNED NOT NULL
               COMMENT 'Wochentage als Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64. "Di und Do" ist also 2+8=10. Eine Bitmaske statt einer eigenen Tabelle, weil es genau sieben feste Werte gibt und nie danach gefiltert wird.',

  start_time   TIME NOT NULL
               COMMENT 'Uhrzeit des Trainingsbeginns, gilt für jeden Wochentag der Serie',
  end_time     TIME NOT NULL
               COMMENT 'Uhrzeit des Endes. Liegt sie vor start_time, geht die Einheit über Mitternacht.',

  starts_on    DATE NOT NULL
               COMMENT 'Erster Tag, ab dem Termine erzeugt werden (einschließlich)',
  ends_on      DATE NOT NULL
               COMMENT 'Letzter Tag der Serie (einschließlich), z. B. das Saisonende',

  reasons_visible_to_all TINYINT(1) NOT NULL DEFAULT 0
               COMMENT 'Voreinstellung für die erzeugten Termine: dürfen alle Spieler:innen die Abmeldegründe der anderen sehen?',

  created_by   INT UNSIGNED DEFAULT NULL
               COMMENT 'FK -> users.id. Wer die Serie angelegt hat. NULL, wenn das Konto gelöscht wurde.',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               COMMENT 'Anlagezeitpunkt',

  PRIMARY KEY (id),
  KEY idx_event_series_team (team_id),

  CONSTRAINT fk_event_series_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_series_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Regel einer wiederkehrenden Trainingsserie. Die einzelnen Einheiten stehen in events.';


-- ----------------------------------------------------------------------------
--  events – ein konkreter Termin
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT
               COMMENT 'Primärschlüssel, wird als event_id referenziert',

  team_id      INT UNSIGNED NOT NULL
               COMMENT 'FK -> teams.id. Wer den Termin sieht, ergibt sich aus der Mannschaftszugehörigkeit.',

  series_id    INT UNSIGNED DEFAULT NULL
               COMMENT 'FK -> event_series.id, wenn der Termin aus einer Serie stammt. NULL = Einzeltermin. Beim Löschen der Serie bleibt der Termin erhalten (SET NULL) – die Historie darf nicht verschwinden.',

  title        VARCHAR(120) NOT NULL
               COMMENT 'Bezeichnung, z. B. "Training" oder "Handballcamp"',

  type         ENUM('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH') NOT NULL
               COMMENT 'REGULAR_TRAINING = Einheit aus der festen Trainingsserie | SINGLE_TRAINING = zusätzliches einmaliges Training | EVENT_CAMP = Sondertermin, auch mehrtägig (Camp, Turnier, Feier) | MATCH = Spiel',

  location     VARCHAR(120) DEFAULT NULL
               COMMENT 'Halle / Treffpunkt. NULL = noch offen.',

  start_time   DATETIME NOT NULL
               COMMENT 'Beginn in ORTSZEIT (kein UTC). Bewusst DATETIME und nicht TIMESTAMP: ein Training um 19:00 Uhr findet um 19:00 Uhr statt, unabhängig von der Zeitzone des Servers.',
  end_time     DATETIME NOT NULL
               COMMENT 'Ende in Ortszeit. Muss nach start_time liegen. Mehrtägige Termine (Camp) haben hier ein späteres Datum.',

  reasons_visible_to_all TINYINT(1) NOT NULL DEFAULT 0
               COMMENT 'AUS (Standard) = nur der/die Trainer:in sieht die Abmeldegründe, alle anderen sehen lediglich WER fehlt. AN = jede:r in der Mannschaft sieht auch WARUM.',

  created_by   INT UNSIGNED DEFAULT NULL
               COMMENT 'FK -> users.id. Wer den Termin angelegt hat. NULL, wenn das Konto gelöscht wurde.',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               COMMENT 'Anlagezeitpunkt',
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
               COMMENT 'Letzte Änderung',

  PRIMARY KEY (id),
  KEY idx_events_team_start (team_id, start_time),
  KEY idx_events_series (series_id),

  CONSTRAINT fk_events_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_series FOREIGN KEY (series_id) REFERENCES event_series(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Trainingseinheiten, Sondertermine und Spiele einer Mannschaft.';


-- ----------------------------------------------------------------------------
--  attendances – ausdrückliche Rückmeldung zu EINEM Termin
-- ----------------------------------------------------------------------------
--  WICHTIG: Hier steht nur, wer sich AKTIV geäußert hat (oder für wen der/die
--  Trainer:in etwas eingetragen hat). Fehlt die Zeile, gilt die Person als
--  ZUGESAGT – im Training ist Dabeisein der Normalfall.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendances (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',

  event_id    INT UNSIGNED NOT NULL
              COMMENT 'FK -> events.id',
  user_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> users.id',

  status      ENUM('ATTENDING','DECLINED') NOT NULL
              COMMENT 'ATTENDING = zugesagt/da | DECLINED = abgesagt/nicht da',

  reason      VARCHAR(200) DEFAULT NULL
              COMMENT 'Grund der Abmeldung, z. B. "Krank" oder "Beruflich". PFLICHT bei DECLINED, bei ATTENDING immer NULL.',

  set_by_user_id INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> users.id. Wer den Eintrag zuletzt gespeichert hat. Weicht er von user_id ab, hat der/die Trainer:in übersteuert – die Oberfläche weist das aus.',

  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
              COMMENT 'Zeitpunkt der letzten Änderung. Entscheidet bei einer dauerhaften Abwesenheit, welche Angabe die jüngere und damit gültige ist.',

  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_event_user (event_id, user_id),
  KEY idx_attendances_user (user_id),

  CONSTRAINT fk_attendances_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendances_setter FOREIGN KEY (set_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Zu- und Absagen zu einzelnen Terminen. Keine Zeile = zugesagt.';


-- ----------------------------------------------------------------------------
--  long_term_absences – Urlaub, Verletzung, sonstige längere Abwesenheit
-- ----------------------------------------------------------------------------
--  Deckt der Zeitraum einen Termin ab, gilt die Person dort automatisch als
--  abgesagt – ohne dass für jede einzelne Einheit eine Zeile in `attendances`
--  entsteht. Das hält die Tabelle klein und macht eine nachträglich
--  verlängerte Verletzung sofort für alle betroffenen Termine wirksam.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS long_term_absences (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',

  user_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> users.id. Wer abwesend ist.',

  team_id     INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> teams.id. NULL = gilt für ALLE Mannschaften der Person (der Normalfall bei Urlaub und Verletzung). Gesetzt = nur für diese eine Mannschaft.',

  type        ENUM('VACATION','INJURY','OTHER') NOT NULL
              COMMENT 'VACATION = Urlaub | INJURY = Verletzung | OTHER = sonstiger Grund',

  start_date  DATE NOT NULL
              COMMENT 'Erster Tag der Abwesenheit (einschließlich)',
  end_date    DATE NOT NULL
              COMMENT 'Letzter Tag der Abwesenheit (einschließlich). Nie vor start_date.',

  note        VARCHAR(200) DEFAULT NULL
              COMMENT 'Freitext, z. B. "Bänderriss" oder "Familienurlaub". Wird als Abmeldegrund angezeigt, sonst greift die Bezeichnung des Typs.',

  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
              COMMENT 'Anlagezeitpunkt. Entscheidet gegen attendances.updated_at, welche Angabe die jüngere und damit gültige ist.',

  PRIMARY KEY (id),
  KEY idx_absences_user_range (user_id, start_date, end_date),
  KEY idx_absences_team (team_id),

  CONSTRAINT fk_absences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_absences_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Urlaub und Verletzungen. Termine im Zeitraum gelten automatisch als abgesagt.';
