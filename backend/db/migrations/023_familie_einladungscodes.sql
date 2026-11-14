-- ============================================================================
--  Migration 023 – Einladungscodes für Kinderprofile (Modul backend/family/)
-- ----------------------------------------------------------------------------
--    family_child_invites  Einmal-Code, den Eltern für ein Kinderprofil ohne
--                          eigenen Login erzeugen. Das Kind registriert sich
--                          damit und übernimmt sein Profil samt Mannschaften,
--                          Zusagen und Abwesenheiten. Die Eltern bleiben
--                          verknüpft. Gespeichert nur als Hash.
--
--  Entfernen:
--    DROP TABLE IF EXISTS family_child_invites;
--    DELETE FROM schema_migrations WHERE filename = '023_familie_einladungscodes.sql';
-- ============================================================================

CREATE TABLE IF NOT EXISTS family_child_invites (
  child_id    INT UNSIGNED NOT NULL,
  code_hash   CHAR(64) NOT NULL COMMENT 'SHA-256 des Codes, der Code selbst steht nirgends',
  created_by  INT UNSIGNED DEFAULT NULL COMMENT 'Elternteil, das den Code erzeugt hat',
  expires_at  DATETIME NOT NULL COMMENT 'Ortszeit, danach ungültig',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (child_id),
  UNIQUE KEY uq_family_invite_code (code_hash),
  CONSTRAINT fk_family_invite_child FOREIGN KEY (child_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_family_invite_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Einladungscodes, mit denen ein Kind sein Profil als eigenes Konto übernimmt.';
