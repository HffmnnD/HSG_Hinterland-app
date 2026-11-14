-- ============================================================================
--  Migration 020 – Eltern-Kind-Verknüpfung (Modul backend/family/)
-- ----------------------------------------------------------------------------
--    family_links       Eltern <-> Kind. Eltern handeln im Konto des Kindes
--                       (Zu-/Absagen, Abwesenheiten, Dienste) und bekommen
--                       dessen Push-Nachrichten mit.
--    family_link_codes  Einmal-Code, den das Kind (oder ein Admin) erzeugt
--                       und die Eltern eingeben. Gespeichert nur als Hash.
--    users.is_managed   Kinderprofil ohne eigenen Login – wird von den Eltern
--                       angelegt und geführt.
--
--  Entfernen:
--    DROP TABLE IF EXISTS family_link_codes, family_links;
--    ALTER TABLE users DROP COLUMN is_managed;
--    DELETE FROM schema_migrations WHERE filename = '020_family_links.sql';
-- ============================================================================

ALTER TABLE users
  ADD COLUMN is_managed TINYINT(1) NOT NULL DEFAULT 0
      COMMENT 'Kinderprofil ohne eigenen Login (von Eltern angelegt). Anmelden ist damit nicht möglich.'
      AFTER is_approved;

CREATE TABLE IF NOT EXISTS family_links (
  parent_id   INT UNSIGNED NOT NULL,
  child_id    INT UNSIGNED NOT NULL,
  created_by  INT UNSIGNED DEFAULT NULL COMMENT 'Wer verknüpft hat (Eltern selbst oder Admin)',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (parent_id, child_id),
  KEY idx_family_child (child_id),
  CONSTRAINT fk_family_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_family_child FOREIGN KEY (child_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_family_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Eltern-Kind-Verknüpfungen.';

CREATE TABLE IF NOT EXISTS family_link_codes (
  child_id    INT UNSIGNED NOT NULL,
  code_hash   CHAR(64) NOT NULL COMMENT 'SHA-256 des Codes – der Code selbst steht nirgends',
  expires_at  DATETIME NOT NULL COMMENT 'Ortszeit, danach ungültig',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (child_id),
  UNIQUE KEY uq_family_code (code_hash),
  CONSTRAINT fk_family_code_child FOREIGN KEY (child_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Einmal-Codes zum Verknüpfen von Eltern und Kind.';
