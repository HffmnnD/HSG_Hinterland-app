-- ============================================================================
--  HSG Hinterland App – Datenbankschema (Stand: konsolidiert)
-- ----------------------------------------------------------------------------
--  Dies ist die EINZIGE, laufend gepflegte Referenz für den Datenbankaufbau.
--
--  Frische Datenbank aufsetzen:
--    - Terminal:   npm run migrate    (empfohlen – führt db/migrations/*.sql
--                  einmalig aus und protokolliert das in `schema_migrations`)
--    - phpMyAdmin: diese Datei komplett ausführen. Der Seed am Ende trägt die
--                  Migrationen als "angewendet" ein, damit ein späteres
--                  `npm run migrate` ohne Effekt durchläuft.
--
--  Alle Struktur-Anweisungen sind idempotent (CREATE TABLE IF NOT EXISTS /
--  INSERT ... ON DUPLICATE KEY) und können gefahrlos erneut laufen.
--
--  Beziehungsübersicht (Details in db/README.md):
--
--      users ──1:n──> user_teams <──n:1── teams
--      users ──1:n──> user_services
--      teams ──1:n──> team_sponsors
--      teams ──1:n──> event_series ──1:n──> events ──1:n──> attendances
--      users ──1:n──> long_term_absences <──n:1── teams
--
-- ============================================================================

CREATE DATABASE IF NOT EXISTS hsg_hinterland
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hsg_hinterland;


-- ----------------------------------------------------------------------------
--  users – Vereinsmitglieder / Login-Konten
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT
                 COMMENT 'Primärschlüssel, wird überall als user_id referenziert',

  first_name     VARCHAR(100) NOT NULL
                 COMMENT 'Vorname (Pflicht, max. 100 Zeichen)',
  last_name      VARCHAR(100) NOT NULL
                 COMMENT 'Nachname (Pflicht, max. 100 Zeichen)',

  email          VARCHAR(255) NOT NULL
                 COMMENT 'E-Mail = Login-Name. Immer klein/getrimmt gespeichert. Eindeutig. Wird bei Trainer:innen als Kontakt im Kader angezeigt.',
  photo_path     VARCHAR(255) DEFAULT NULL
                 COMMENT 'Profilbild in backend/uploads/, z. B. "users/ab12.jpg". Ausgeliefert über /api/uploads/<pfad>. NULL = Initialen anzeigen.',
  phone          VARCHAR(30) DEFAULT NULL
                 COMMENT 'Freiwillige Telefonnummer aus den Kontoeinstellungen. Kontakt neben der E-Mail – bei Trainer:innen für alle sichtbar, bei Spieler:innen nur für das Trainerteam.',
  password_hash  VARCHAR(255) NOT NULL
                 COMMENT 'bcrypt-Hash des Passworts. Nie im Klartext, nie an den Client.',

  is_approved    TINYINT(1) NOT NULL DEFAULT 1
                 COMMENT 'Konto aktiv (1) oder von einem Admin gesperrt (0). Standard 1 – es gibt KEINE Registrierungs-Freigabe. Wird bei Login, Session (/me) und RBAC geprüft, damit eine Sperre sofort greift.',

  role           ENUM('admin','sub_admin','trainer','spieler','zuschauer')
                 NOT NULL DEFAULT 'spieler'
                 COMMENT 'RBAC-Rolle. admin = Vollzugriff | sub_admin = wie admin, aber ohne Zugriff auf admin-Konten und ohne admin-Vergabe | trainer = Mitgliederliste + Mannschaftszuordnung | spieler/zuschauer = nur lesen. Wird NICHT bei der Registrierung gesetzt, sondern im Onboarding bzw. von einem Admin.',

  theme          ENUM('system','light','dark') NOT NULL DEFAULT 'system'
                 COMMENT 'Design-Vorliebe: system = dem Gerät folgen | light | dark. Gilt geräteübergreifend, weil sie am Konto hängt.',
  onboarding_completed_at DATETIME DEFAULT NULL
                 COMMENT 'Abschluss des Onboarding-Assistenten (Ortszeit). NULL = steht beim nächsten Login an.',

  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                 COMMENT 'Zeitpunkt der Registrierung',

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Vereinsmitglieder und ihre Login-Daten. Zentrale Tabelle des Systems.';


-- ----------------------------------------------------------------------------
--  teams – Mannschaften des Vereins
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT
                   COMMENT 'Primärschlüssel, wird als team_id referenziert',
  name             VARCHAR(100) NOT NULL
                   COMMENT 'Ausgeschriebener Name, z. B. "Männliche Jugend C"',
  age_group        VARCHAR(40) DEFAULT NULL
                   COMMENT 'Altersklasse / Jugend, z. B. "A-Jugend" oder "Erwachsene". Frei formulierbar. NULL = nicht angegeben.',
  gender           ENUM('male','female','mixed') DEFAULT NULL
                   COMMENT 'Geschlecht der Mannschaft: male | female | mixed. NULL = nicht angegeben.',
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0
                   COMMENT 'Anzeigereihenfolge im Frontend, kleinste Zahl zuerst; bei Gleichstand entscheidet der Name.',
  handball_team_id VARCHAR(20) DEFAULT NULL
                   COMMENT 'nuLiga-Mannschaftsnummer (`teamtable`, rein numerisch). Speist Tabelle, Spielplan und Live-Ticker der Mannschaftsseite. NULL = keine Ligaanbindung.',
  photo_path       VARCHAR(255) DEFAULT NULL
                   COMMENT 'Relativer Pfad des Mannschaftsfotos in backend/uploads/, z. B. "teams/ab12.jpg". Ausgeliefert über /api/uploads/<pfad>.',
  photo_focus_x    TINYINT UNSIGNED NOT NULL DEFAULT 50
                   COMMENT 'Waagerechter Bildmittelpunkt im Kopfbereich in Prozent (0 = links, 100 = rechts). Entspricht object-position.',
  photo_focus_y    TINYINT UNSIGNED NOT NULL DEFAULT 50
                   COMMENT 'Senkrechter Bildmittelpunkt im Kopfbereich in Prozent (0 = Oberkante, 100 = Unterkante). Damit rutschen Köpfe ins Bild.',
  photo_zoom       SMALLINT UNSIGNED NOT NULL DEFAULT 100
                   COMMENT 'Vergrößerung des Fotos im Kopfbereich in Prozent (100 = einpassen, 300 = dreifach).',
  nuliga_sync_enabled TINYINT(1) NOT NULL DEFAULT 0
                   COMMENT 'Ligaspiele aus nuLiga als Termine in den Kalender übernehmen? Standard aus. Wird im Planungsbereich vom Trainerteam gesetzt.',
  nuliga_synced_at DATETIME DEFAULT NULL
                   COMMENT 'Zeitpunkt des letzten erfolgreichen nuLiga-Abgleichs (Ortszeit). NULL = noch nie.',
  code             VARCHAR(20) NOT NULL
                   COMMENT 'Kurzkürzel für URLs und Chips, z. B. "MJC". Eindeutig, immer GROSS.',

  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code),
  KEY idx_teams_sort (sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Stammdaten der Mannschaften. Wird per Seed unten befüllt.';

-- Standard-Mannschaften. `code` ist eindeutig -> Re-Run aktualisiert nur den Namen.
INSERT INTO teams (code, name, age_group, gender, sort_order) VALUES
  ('MJC', 'Männliche Jugend C', 'C-Jugend',   'male',   10),
  ('MJB', 'Männliche Jugend B', 'B-Jugend',   'male',   20),
  ('MJA', 'Männliche Jugend A', 'A-Jugend',   'male',   30),
  ('H1',  '1. Herren',          'Erwachsene', 'male',   40),
  ('H2',  '2. Herren',          'Erwachsene', 'male',   50),
  ('D1',  'Damen',              'Erwachsene', 'female', 60)
ON DUPLICATE KEY UPDATE name = VALUES(name);


-- ----------------------------------------------------------------------------
--  user_teams – Zuordnung Mitglied <-> Mannschaft (n:m) inkl. Art der Beziehung
-- ----------------------------------------------------------------------------
--  Eine Person kann pro Mannschaft MEHRERE Beziehungen haben, z. B. Trainer
--  der MJC UND Spieler der 1. Herren -> deshalb steckt relation_type mit im
--  Primärschlüssel.
--
--  is_confirmed steuert den Beitrittsprozess: player/coach werden mit 0
--  (= offene Anfrage) angelegt und vom Trainer der Mannschaft bestätigt;
--  fan sowie manuell durch Trainer/Admin angelegte Zuordnungen sind sofort 1.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_teams (
  user_id        INT UNSIGNED NOT NULL
                 COMMENT 'FK -> users.id',
  team_id        INT UNSIGNED NOT NULL
                 COMMENT 'FK -> teams.id',
  relation_type  ENUM('player','coach','fan') NOT NULL DEFAULT 'player'
                 COMMENT 'Art der Beziehung: player = spielt in der Mannschaft | coach = trainiert sie (darf ihren Kader verwalten) | fan = interessiert sich für sie',
  is_confirmed   TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT 'Vom Trainer bestätigt (1) oder offene Beitrittsanfrage (0). player/coach starten mit 0, fan wird direkt mit 1 angelegt.',

  jersey_number  TINYINT UNSIGNED DEFAULT NULL
                 COMMENT 'Rückennummer in DIESER Mannschaft (1-99). NULL = keine feste Nummer.',
  position       ENUM('tor','rueckraum','aussen','kreis') DEFAULT NULL
                 COMMENT 'Spielposition in DIESER Mannschaft. NULL = nicht angegeben. Bewusst hier und nicht an `users`: wer in zwei Mannschaften spielt, spielt dort oft auf verschiedenen Positionen.',
  staff_title    VARCHAR(60) DEFAULT NULL
                 COMMENT 'Bezeichnung im Trainer-/Betreuerstab, z. B. "Co-Trainer". Nur für relation_type = coach.',

  PRIMARY KEY (user_id, team_id, relation_type),
  KEY idx_user_teams_team (team_id),
  KEY idx_user_teams_user (user_id),

  CONSTRAINT fk_user_teams_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_teams_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Verknüpfung Mitglied<->Mannschaft. Löscht ein Mitglied/Team, verschwinden die Zuordnungen automatisch (ON DELETE CASCADE).';


-- ----------------------------------------------------------------------------
--  user_services – Helferdienste, die ein Mitglied übernimmt
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_services (
  user_id       INT UNSIGNED NOT NULL
                COMMENT 'FK -> users.id',
  service_type  ENUM('zeitnehmer','verkaufsdienst') NOT NULL
                COMMENT 'Angebotener Helferdienst',

  PRIMARY KEY (user_id, service_type),
  CONSTRAINT fk_user_services_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Welche Helferdienste ein "Mitwirkender" übernimmt. ON DELETE CASCADE.';


-- ----------------------------------------------------------------------------
--  team_sponsors – Haupt-Sponsoren einer Mannschaft
-- ----------------------------------------------------------------------------
--  Werden im Kopfbereich der Mannschaftsseite angezeigt. Eigene Tabelle statt
--  Textspalte: Sponsoren kommen und gehen einzeln, brauchen eine Reihenfolge
--  und je einen eigenen Link.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_sponsors (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',
  team_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> teams.id',
  name        VARCHAR(100) NOT NULL
              COMMENT 'Name des Sponsors',
  website_url VARCHAR(255) DEFAULT NULL
              COMMENT 'Optionale Website (nur http/https). NULL = nicht verlinkt.',
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0
              COMMENT 'Anzeigereihenfolge, kleinste Zahl zuerst',

  PRIMARY KEY (id),
  KEY idx_team_sponsors_team (team_id, sort_order),
  CONSTRAINT fk_team_sponsors_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sponsoren je Mannschaft. ON DELETE CASCADE.';


-- ----------------------------------------------------------------------------
--  news – Vereins-News / Ankündigungen (Schwarzes Brett)
-- ----------------------------------------------------------------------------
--  Erstellen/Löschen nur `admin` und `sub_admin`, Lesen alle angemeldeten
--  Mitglieder. Bilder liegen im Dateisystem (backend/uploads/), hier steht
--  nur der relative Pfad.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel des Beitrags',

  title       VARCHAR(150) NOT NULL
              COMMENT 'Überschrift der Ankündigung (Pflicht, max. 150 Zeichen)',
  content     TEXT NOT NULL
              COMMENT 'Fließtext der Ankündigung (Pflicht). Reiner Text – wird im Frontend nie als HTML gerendert.',

  is_archived TINYINT(1) NOT NULL DEFAULT 0
              COMMENT 'Archiviert (1) oder aktiv (0). Archivierte Beiträge verschwinden aus dem Feed, bleiben in der Verwaltung unter "Archiv" erhalten und lassen sich zurückholen.',

  author_id   INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> users.id. NULL, wenn das Konto gelöscht wurde – der Beitrag bleibt erhalten.',

  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
              COMMENT 'Veröffentlichungszeitpunkt. Sortierkriterium des Feeds (absteigend).',
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
              COMMENT 'Letzte Änderung',

  PRIMARY KEY (id),
  KEY idx_news_created (created_at),
  KEY idx_news_archived_created (is_archived, created_at),
  KEY idx_news_author (author_id),

  CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Vereins-News und Ankündigungen. Erstellen/Löschen nur admin & sub_admin, Lesen alle angemeldeten Mitglieder.';


-- ----------------------------------------------------------------------------
--  event_series – Regel einer wiederkehrenden Trainingsserie
-- ----------------------------------------------------------------------------
--  Die einzelnen Einheiten werden beim Anlegen als Zeilen in `events`
--  erzeugt (materialisiert). Diese Regel bleibt erhalten, damit sich die
--  Serie als Ganzes bearbeiten oder beenden lässt.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_series (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT
               COMMENT 'Primärschlüssel, wird von events.series_id referenziert',
  team_id      INT UNSIGNED NOT NULL
               COMMENT 'FK -> teams.id',
  title        VARCHAR(120) NOT NULL
               COMMENT 'Bezeichnung, wird auf jeden erzeugten Termin übernommen',
  type         ENUM('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH')
               NOT NULL DEFAULT 'REGULAR_TRAINING'
               COMMENT 'Terminart der erzeugten Einheiten',
  location     VARCHAR(120) DEFAULT NULL
               COMMENT 'Halle / Treffpunkt. NULL = noch offen.',
  weekdays     TINYINT UNSIGNED NOT NULL
               COMMENT 'Wochentage als Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64. "Di und Do" = 10.',
  start_time   TIME NOT NULL COMMENT 'Uhrzeit des Beginns, gilt für jeden Wochentag der Serie',
  end_time     TIME NOT NULL COMMENT 'Uhrzeit des Endes. Vor start_time = über Mitternacht.',
  starts_on    DATE NOT NULL COMMENT 'Erster Tag der Serie (einschließlich)',
  ends_on      DATE NOT NULL COMMENT 'Letzter Tag der Serie (einschließlich)',
  reasons_visible_to_all TINYINT(1) NOT NULL DEFAULT 0
               COMMENT 'Voreinstellung für die erzeugten Termine',
  created_by   INT UNSIGNED DEFAULT NULL COMMENT 'FK -> users.id, ON DELETE SET NULL',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_event_series_team (team_id),

  CONSTRAINT fk_event_series_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_series_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Regel einer wiederkehrenden Trainingsserie. Die Einheiten stehen in events.';


-- ----------------------------------------------------------------------------
--  events – ein konkreter Termin (Training, Sondertermin, Spiel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT
               COMMENT 'Primärschlüssel, wird als event_id referenziert',
  team_id      INT UNSIGNED NOT NULL
               COMMENT 'FK -> teams.id. Bestimmt, wer den Termin sieht.',
  series_id    INT UNSIGNED DEFAULT NULL
               COMMENT 'FK -> event_series.id. NULL = Einzeltermin. ON DELETE SET NULL, damit die Historie beim Löschen der Serie bleibt.',
  nuliga_game_id VARCHAR(64) DEFAULT NULL
               COMMENT 'Herkunft aus nuLiga als "nr:<Spielnummer>@<Saison>", z. B. "nr:14@2026". NULL = von Hand angelegt (der Abgleich fasst solche Termine nie an). Bewusst die Spielnummer und nicht die nuLiga-Spiel-ID: die entsteht erst mit dem Spielbericht und fehlt vor der Saison bei fast jedem Spiel.',
  title        VARCHAR(120) NOT NULL COMMENT 'z. B. "Training" oder "Handballcamp"',
  type         ENUM('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH') NOT NULL
               COMMENT 'REGULAR_TRAINING = Einheit aus der Trainingsserie | SINGLE_TRAINING = zusätzliches einmaliges Training | EVENT_CAMP = Sondertermin, auch mehrtägig | MATCH = Spiel',
  location     VARCHAR(120) DEFAULT NULL COMMENT 'Halle / Treffpunkt',
  start_time   DATETIME NOT NULL
               COMMENT 'Beginn in ORTSZEIT (kein UTC). DATETIME statt TIMESTAMP: 19:00 Uhr bleibt 19:00 Uhr.',
  end_time     DATETIME NOT NULL
               COMMENT 'Ende in Ortszeit, immer nach start_time. Mehrtägige Termine enden an einem späteren Datum.',
  reasons_visible_to_all TINYINT(1) NOT NULL DEFAULT 0
               COMMENT 'AUS (Standard) = nur Trainer:innen sehen die Abmeldegründe, alle anderen sehen nur WER fehlt. AN = alle sehen auch WARUM.',
  cancelled_at DATETIME DEFAULT NULL
               COMMENT 'Zeitpunkt der Absage (Ortszeit). NULL = findet statt. Gesetzt = Termin bleibt sichtbar, ist als abgesagt gekennzeichnet und zählt in keiner Beteiligungsquote mit.',
  cancel_reason VARCHAR(200) DEFAULT NULL
               COMMENT 'Kurzer Grund der Absage, z. B. "Halle belegt". Sehen alle in der Mannschaft.',
  created_by   INT UNSIGNED DEFAULT NULL COMMENT 'FK -> users.id, ON DELETE SET NULL',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_events_team_start (team_id, start_time),
  KEY idx_events_series (series_id),
  -- Macht den nuLiga-Abgleich idempotent: ein zweiter Lauf aktualisiert
  -- denselben Termin, statt ihn doppelt anzulegen.
  UNIQUE KEY uq_events_nuliga (team_id, nuliga_game_id),

  CONSTRAINT fk_events_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_series FOREIGN KEY (series_id) REFERENCES event_series(id) ON DELETE SET NULL,
  CONSTRAINT fk_events_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Trainingseinheiten, Sondertermine und Spiele einer Mannschaft.';


-- ----------------------------------------------------------------------------
--  attendances – ausdrückliche Zu-/Absage zu EINEM Termin
-- ----------------------------------------------------------------------------
--  Fehlt die Zeile, gilt die Person als ZUGESAGT. Im Training ist Dabeisein
--  der Normalfall – melden muss sich nur, wer NICHT kommt.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendances (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  event_id    INT UNSIGNED NOT NULL COMMENT 'FK -> events.id',
  user_id     INT UNSIGNED NOT NULL COMMENT 'FK -> users.id',
  status      ENUM('ATTENDING','DECLINED') NOT NULL
              COMMENT 'ATTENDING = zugesagt/da | DECLINED = abgesagt/nicht da',
  reason      VARCHAR(200) DEFAULT NULL
              COMMENT 'Grund der Abmeldung. PFLICHT bei DECLINED, bei ATTENDING immer NULL.',
  set_by_user_id INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> users.id. Wer zuletzt gespeichert hat – weicht er von user_id ab, hat der/die Trainer:in übersteuert.',
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
              COMMENT 'Letzte Änderung. Entscheidet gegen long_term_absences.created_at, welche Angabe die jüngere ist.',

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
--  abgesagt – ohne Zeile in `attendances`.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS long_term_absences (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  user_id     INT UNSIGNED NOT NULL COMMENT 'FK -> users.id',
  team_id     INT UNSIGNED DEFAULT NULL
              COMMENT 'FK -> teams.id. NULL = gilt für ALLE Mannschaften der Person (Normalfall).',
  type        ENUM('VACATION','INJURY','OTHER') NOT NULL
              COMMENT 'VACATION = Urlaub | INJURY = Verletzung | OTHER = sonstiger Grund',
  start_date  DATE NOT NULL COMMENT 'Erster Tag (einschließlich)',
  end_date    DATE NOT NULL COMMENT 'Letzter Tag (einschließlich), nie vor start_date',
  note        VARCHAR(200) DEFAULT NULL
              COMMENT 'Freitext, wird als Abmeldegrund angezeigt. NULL -> Bezeichnung des Typs.',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
              COMMENT 'Anlagezeitpunkt. Entscheidet gegen attendances.updated_at.',

  PRIMARY KEY (id),
  KEY idx_absences_user_range (user_id, start_date, end_date),
  KEY idx_absences_team (team_id),

  CONSTRAINT fk_absences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_absences_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Urlaub und Verletzungen. Termine im Zeitraum gelten automatisch als abgesagt.';

-- ----------------------------------------------------------------------------
--  news_images – Bilder eines Beitrags (beliebig viele, in Reihenfolge)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_images (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT
              COMMENT 'Primärschlüssel',
  news_id     INT UNSIGNED NOT NULL
              COMMENT 'FK -> news.id, ON DELETE CASCADE. Die Dateien räumt der Controller weg.',
  image_path  VARCHAR(255) NOT NULL
              COMMENT 'Relativer Pfad in backend/uploads/, z. B. "news/ab12cd34.jpg".',
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0
              COMMENT 'Anzeigereihenfolge im Beitrag, kleinste Zahl zuerst.',

  PRIMARY KEY (id),
  KEY idx_news_images_news (news_id, sort_order),

  CONSTRAINT fk_news_images_news FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bilder eines Vereins-Beitrags. Beliebig viele je Beitrag.';


-- ----------------------------------------------------------------------------
--  schema_migrations – vom Migrations-Runner (db/migrate.js) gepflegt
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    VARCHAR(255) NOT NULL PRIMARY KEY
              COMMENT 'Dateiname der angewendeten Migration',
  applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Welche Migrationen bereits gelaufen sind. Verhindert doppelte Backfills.';

-- Wer dieses Schema direkt einspielt, hat den Stand ALLER Migrationen ->
-- als angewendet markieren, damit `npm run migrate` nichts nachträglich tut.
INSERT INTO schema_migrations (filename) VALUES
  ('001_initial_schema.sql'),
  ('002_team_confirmation.sql'),
  ('003_activate_existing_accounts.sql'),
  ('004_news_table.sql'),
  ('005_team_page.sql'),
  ('006_admin_console.sql'),
  ('007_news_second_image.sql'),
  ('008_news_images_table.sql'),
  ('009_schedule_module.sql'),
  ('010_nuliga_games.sql'),
  ('011_event_cancellation.sql'),
  ('012_nuliga_key_cleanup.sql'),
  ('013_onboarding_theme.sql'),
  ('014_instant_signup_and_profile.sql')
ON DUPLICATE KEY UPDATE filename = filename;
