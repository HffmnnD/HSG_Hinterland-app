-- Migration: Helferdienste (Mitwirkende).
-- Idempotent – kann mehrfach ausgeführt werden.

USE hsg_hinterland;

CREATE TABLE IF NOT EXISTS user_services (
  user_id       INT UNSIGNED NOT NULL,
  service_type  ENUM('zeitnehmer', 'verkaufsdienst') NOT NULL,
  PRIMARY KEY (user_id, service_type),
  CONSTRAINT fk_user_services_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
