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
                 COMMENT 'E-Mail = Login-Name. Immer klein/getrimmt gespeichert. Eindeutig.',
  password_hash  VARCHAR(255) NOT NULL
                 COMMENT 'bcrypt-Hash des Passworts. Nie im Klartext, nie an den Client.',

  is_approved    TINYINT(1) NOT NULL DEFAULT 1
                 COMMENT 'Konto aktiv (1) oder von einem Admin gesperrt (0). Standard 1 – KEINE globale Registrierungs-Freigabe. Wird bei Login, Session (/me) und RBAC geprüft, damit eine Admin-Sperre sofort greift.',

  role           ENUM('admin','sub_admin','trainer','spieler','zuschauer')
                 NOT NULL DEFAULT 'spieler'
                 COMMENT 'RBAC-Rolle. admin = Vollzugriff | sub_admin = wie admin, aber ohne Zugriff auf admin-Konten und ohne admin-Vergabe | trainer = Mitgliederliste + Mannschaftszuordnung | spieler/zuschauer = nur lesen. Wird NICHT bei der Registrierung gesetzt, sondern von einem Admin.',

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

  image_path  VARCHAR(255) DEFAULT NULL
              COMMENT 'Relativer Pfad des Beitragsbilds in backend/uploads/, z. B. "news/ab12cd34.jpg". NULL = ohne Bild.',

  image_path_2 VARCHAR(255) DEFAULT NULL
              COMMENT 'Zweites Beitragsbild (gleiches Format). NULL = kein zweites Bild. Höchstens zwei Bilder je Beitrag.',

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
  ('007_news_second_image.sql')
ON DUPLICATE KEY UPDATE filename = filename;
