-- ============================================================================
--  Migration 001 – Basis-Schema (eingefroren)
-- ----------------------------------------------------------------------------
--  Diese Datei ist der Ausgangszustand der Datenbank und ändert sich nicht
--  mehr. Sie ist inhaltlich identisch mit ../schema.sql (dort steht die
--  laufend gepflegte, kommentierte Referenz).
--
--  Weitere Schemaänderungen kommen als 002_*.sql, 003_*.sql, ... dazu.
--  `npm run migrate` führt alle Dateien in dieser Reihenfolge aus; alle
--  Anweisungen sind idempotent und dürfen mehrfach laufen.
--
--  Beziehungsübersicht (Details in ../README.md):
--
--      users ──1:n──> user_teams <──n:1── teams
--      users ──1:n──> user_services
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

  is_approved    TINYINT(1) NOT NULL DEFAULT 0
                 COMMENT 'Freigabe-Flag: 0 = wartet auf Admin-Freigabe (kein Login möglich), 1 = aktiv',

  role           ENUM('admin','sub_admin','trainer','spieler','zuschauer')
                 NOT NULL DEFAULT 'spieler'
                 COMMENT 'RBAC-Rolle. admin = Vollzugriff | sub_admin = wie admin, aber ohne Zugriff auf admin-Konten und ohne admin-Vergabe | trainer = Mitgliederliste + Mannschaftszuordnung | spieler/zuschauer = nur lesen. Wird NICHT bei der Registrierung gesetzt, sondern vom Admin bei der Freigabe.',

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
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT
        COMMENT 'Primärschlüssel, wird als team_id referenziert',
  name  VARCHAR(100) NOT NULL
        COMMENT 'Ausgeschriebener Name, z. B. "Männliche Jugend C"',
  code  VARCHAR(20) NOT NULL
        COMMENT 'Kurzkürzel für URLs und Chips, z. B. "MJC". Eindeutig, immer GROSS.',

  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Stammdaten der Mannschaften. Wird per Seed unten befüllt.';

-- Standard-Mannschaften. `code` ist eindeutig -> Re-Run aktualisiert nur den Namen.
INSERT INTO teams (code, name) VALUES
  ('MJC', 'Männliche Jugend C'),
  ('MJB', 'Männliche Jugend B'),
  ('MJA', 'Männliche Jugend A'),
  ('H1',  '1. Herren'),
  ('H2',  '2. Herren'),
  ('D1',  'Damen')
ON DUPLICATE KEY UPDATE name = VALUES(name);


-- ----------------------------------------------------------------------------
--  user_teams – Zuordnung Mitglied <-> Mannschaft (n:m) inkl. Art der Beziehung
-- ----------------------------------------------------------------------------
--  Eine Person kann pro Mannschaft MEHRERE Beziehungen haben, z. B. Trainer
--  der MJC UND Spieler der 1. Herren -> deshalb steckt relation_type mit im
--  Primärschlüssel.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_teams (
  user_id        INT UNSIGNED NOT NULL
                 COMMENT 'FK -> users.id',
  team_id        INT UNSIGNED NOT NULL
                 COMMENT 'FK -> teams.id',
  relation_type  ENUM('player','coach','fan') NOT NULL DEFAULT 'player'
                 COMMENT 'Art der Beziehung: player = spielt in der Mannschaft | coach = trainiert sie (darf ihren Kader verwalten) | fan = interessiert sich für sie',

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
