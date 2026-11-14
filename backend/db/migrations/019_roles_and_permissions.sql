-- ============================================================================
--  Migration 019 – Rollen und Einzelrechte (Modul backend/access/)
-- ----------------------------------------------------------------------------
--  Bisher entschied allein users.role (admin, sub_admin, trainer, spieler,
--  zuschauer), wer was darf. Ab jetzt:
--
--    roles              Rollen als Bündel von Rechten. Die fünf bisherigen
--                       Rollen sind Systemrollen (nicht löschbar), dazu kommen
--                       Vereinsrollen wie Vorstand oder Jugendleitung.
--    role_permissions   welche Rechte eine Rolle bündelt
--    user_roles         ZUSÄTZLICHE Rollen einer Person (neben users.role)
--    user_permissions   Einzelrechte je Person: grant = zusätzlich erlaubt,
--                       deny = ausdrücklich entzogen (schlägt jede Rolle)
--
--  users.role bleibt als Grundrolle erhalten und ist zugleich ein Eintrag in
--  `roles` (gleicher Schlüssel). Wirksame Rechte = Rechte der Grundrolle +
--  Rechte der Zusatzrollen + Einzelfreigaben − Einzelentzüge.
--  Rollen mit is_superuser haben immer ALLE Rechte (nicht entziehbar), damit
--  sich der Verein nie aus seiner eigenen Verwaltung aussperrt.
--
--  Mannschaftsrechte (Kader, Termine einer Mannschaft) hängen weiterhin an der
--  Zuordnung „coach" in user_teams – sie skalieren mit jeder neuen Mannschaft.
--
--  Entfernen:
--    DROP TABLE IF EXISTS user_permissions, user_roles, role_permissions, roles;
--    DELETE FROM schema_migrations WHERE filename = '019_roles_and_permissions.sql';
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key      VARCHAR(40)  NOT NULL
                COMMENT 'Technischer Schlüssel. Bei Systemrollen identisch mit dem Wert in users.role.',
  name          VARCHAR(60)  NOT NULL COMMENT 'Anzeigename, z. B. "Jugendleitung"',
  description   VARCHAR(255) DEFAULT NULL,
  is_system     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Systemrolle: Schlüssel fest, nicht löschbar',
  is_superuser  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Hat immer alle Rechte',
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rollen im Verein (Bündel von Rechten).';

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id     INT UNSIGNED NOT NULL,
  permission  VARCHAR(60)  NOT NULL COMMENT 'Schlüssel aus backend/access/permissions.js',
  PRIMARY KEY (role_id, permission),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rechte je Rolle.';

CREATE TABLE IF NOT EXISTS user_roles (
  user_id      INT UNSIGNED NOT NULL,
  role_id      INT UNSIGNED NOT NULL,
  assigned_by  INT UNSIGNED DEFAULT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Zusatzrollen je Person (die Grundrolle steht in users.role).';

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id      INT UNSIGNED NOT NULL,
  permission   VARCHAR(60)  NOT NULL,
  effect       ENUM('grant','deny') NOT NULL,
  assigned_by  INT UNSIGNED DEFAULT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Einzelrechte je Person: grant ergänzt, deny entzieht.';

-- Systemrollen: dieselben Schlüssel wie users.role.
INSERT INTO roles (role_key, name, description, is_system, is_superuser, sort_order) VALUES
  ('admin',     'Admin',      'Vollzugriff auf alle Funktionen, inklusive Rollen und Rechte.', 1, 1, 10),
  ('sub_admin', 'Sub-Admin',  'Verwaltet Mitglieder, Mannschaften, News und Dienste. Keine Rechtevergabe.', 1, 0, 20),
  ('trainer',   'Trainer:in', 'Sieht die Mitgliederliste, um Spieler:innen der eigenen Mannschaften zuzuordnen.', 1, 0, 30),
  ('spieler',   'Spieler:in', 'Aktives Mitglied einer Mannschaft.', 1, 0, 40),
  ('zuschauer', 'Zuschauer:in', 'Fan oder Unterstützer:in ohne eigene Mannschaft.', 1, 0, 50)
ON DUPLICATE KEY UPDATE role_key = role_key;

-- Vereinsrollen als Vorlage – frei änderbar und löschbar.
INSERT INTO roles (role_key, name, description, is_system, is_superuser, sort_order) VALUES
  ('vorstand',      'Vorstand',       'Überblick über den Verein, News und Rundnachrichten.', 0, 0, 60),
  ('jugendleitung', 'Jugendleitung',  'Betreut alle Jugendmannschaften, Eltern-Kind-Verknüpfungen und Rundnachrichten.', 0, 0, 70),
  ('dienstplanung', 'Dienstplanung',  'Erstellt und verwaltet Dienstpläne.', 0, 0, 80),
  ('presse',        'Presse & Medien','Veröffentlicht Vereins-News.', 0, 0, 90)
ON DUPLICATE KEY UPDATE role_key = role_key;

INSERT IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM roles r
  JOIN (
              SELECT 'sub_admin' AS role_key, 'members.view' AS permission
    UNION ALL SELECT 'sub_admin', 'members.contact'
    UNION ALL SELECT 'sub_admin', 'members.edit'
    UNION ALL SELECT 'sub_admin', 'members.lock'
    UNION ALL SELECT 'sub_admin', 'members.roles'
    UNION ALL SELECT 'sub_admin', 'teams.create'
    UNION ALL SELECT 'sub_admin', 'teams.edit'
    UNION ALL SELECT 'sub_admin', 'teams.manage_all'
    UNION ALL SELECT 'sub_admin', 'news.manage'
    UNION ALL SELECT 'sub_admin', 'messages.broadcast'
    UNION ALL SELECT 'sub_admin', 'duties.manage'
    UNION ALL SELECT 'sub_admin', 'family.manage'
    UNION ALL SELECT 'sub_admin', 'system.view'
    UNION ALL SELECT 'sub_admin', 'settings.manage'
    UNION ALL SELECT 'trainer', 'members.view'
    UNION ALL SELECT 'vorstand', 'members.view'
    UNION ALL SELECT 'vorstand', 'members.contact'
    UNION ALL SELECT 'vorstand', 'news.manage'
    UNION ALL SELECT 'vorstand', 'messages.broadcast'
    UNION ALL SELECT 'jugendleitung', 'members.view'
    UNION ALL SELECT 'jugendleitung', 'members.contact'
    UNION ALL SELECT 'jugendleitung', 'members.edit'
    UNION ALL SELECT 'jugendleitung', 'teams.manage_all'
    UNION ALL SELECT 'jugendleitung', 'messages.broadcast'
    UNION ALL SELECT 'jugendleitung', 'family.manage'
    UNION ALL SELECT 'dienstplanung', 'duties.manage'
    UNION ALL SELECT 'presse', 'news.manage'
  ) p ON p.role_key = r.role_key;
