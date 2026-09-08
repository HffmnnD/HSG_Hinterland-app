-- Datenbankschema für die Authentifizierung der HSG Hinterland App.
-- In phpMyAdmin auf der Datenbank `hsg_hinterland` ausführen.

CREATE DATABASE IF NOT EXISTS hsg_hinterland
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hsg_hinterland;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name     VARCHAR(100)  NOT NULL,
  last_name      VARCHAR(100)  NOT NULL,
  email          VARCHAR(255)  NOT NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  is_approved    TINYINT(1)    NOT NULL DEFAULT 0,
  role           ENUM('admin', 'trainer', 'spieler', 'zuschauer') NOT NULL DEFAULT 'spieler',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bestehende Datenbank nachträglich erweitern (siehe db/migrations/).
