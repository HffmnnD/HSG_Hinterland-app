-- ============================================================================
--  Migration 031 – Strafenkatalog und Mannschaftskasse (Modul backend/fines/)
-- ----------------------------------------------------------------------------
--  Lastenheft 2.8: Geldstrafen mit Standardgründen und individuellen Einträgen.
--
--    fine_catalog   Standardgründe einer Mannschaft mit Betrag
--    fines          einzelne Strafe einer Person (aus dem Katalog oder frei)
--
--  Beträge stehen in Cent (INT) – nie als Kommazahl, damit Summen stimmen.
--  Wird ein Katalogeintrag gelöscht, behält die Strafe Grund und Betrag
--  (beides wird beim Eintragen kopiert).
--
--  Entfernen:
--    DROP TABLE IF EXISTS fines, fine_catalog
--    DELETE FROM schema_migrations WHERE filename = '031_strafenkatalog.sql'
-- ============================================================================

CREATE TABLE IF NOT EXISTS fine_catalog (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id       INT UNSIGNED NOT NULL COMMENT 'FK -> teams.id',
  label         VARCHAR(120) NOT NULL COMMENT 'Grund, z. B. Zu spät zum Training',
  amount_cents  INT UNSIGNED NOT NULL COMMENT 'Betrag in Cent',
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_fine_catalog_team (team_id, sort_order),
  CONSTRAINT fk_fine_catalog_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Standardgründe des Strafenkatalogs je Mannschaft.';

CREATE TABLE IF NOT EXISTS fines (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id       INT UNSIGNED NOT NULL COMMENT 'FK -> teams.id',
  user_id       INT UNSIGNED NOT NULL COMMENT 'FK -> users.id. Wer die Strafe zahlt.',
  catalog_id    INT UNSIGNED DEFAULT NULL COMMENT 'FK -> fine_catalog.id, NULL = individueller Eintrag',
  reason        VARCHAR(160) NOT NULL COMMENT 'Grund im Klartext (Kopie aus dem Katalog oder frei)',
  amount_cents  INT UNSIGNED NOT NULL,
  fined_on      DATE NOT NULL COMMENT 'Tag des Anlasses',
  note          VARCHAR(200) DEFAULT NULL,
  paid_at       DATETIME DEFAULT NULL COMMENT 'NULL = offen',
  paid_marked_by INT UNSIGNED DEFAULT NULL,
  created_by    INT UNSIGNED DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_fines_team (team_id, fined_on),
  KEY idx_fines_user (user_id),
  CONSTRAINT fk_fines_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_fines_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fines_catalog FOREIGN KEY (catalog_id) REFERENCES fine_catalog(id) ON DELETE SET NULL,
  CONSTRAINT fk_fines_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fines_payer FOREIGN KEY (paid_marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Einzelne Strafen der Mannschaftskasse.';
