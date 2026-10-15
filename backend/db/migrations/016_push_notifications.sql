-- ============================================================================
--  Migration 016 – Push-Benachrichtigungen (Modul backend/push/)
-- ----------------------------------------------------------------------------
--  Drei eigene Tabellen, keine Änderung an bestehenden. Wer das Modul wieder
--  entfernt, löscht sie mit:
--
--    DROP TABLE IF EXISTS push_log, push_preferences, push_subscriptions;
--    DELETE FROM schema_migrations WHERE filename = '016_push_notifications.sql';
--
--  Bewusst NICHT in db/schema.sql: Nach einem Import von schema.sql spielt
--  `npm run migrate` diese Datei nach. So bleibt das Modul an einer Stelle.
-- ============================================================================

-- Ein Eintrag je Gerät/Browser, auf dem jemand Push eingeschaltet hat.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL
                 COMMENT 'FK -> users.id. Wechselt, wenn sich am selben Gerät jemand anderes anmeldet.',
  endpoint       TEXT NOT NULL
                 COMMENT 'Adresse beim Push-Dienst des Browsers (Google, Mozilla, Apple, Microsoft).',
  endpoint_hash  CHAR(64) NOT NULL
                 COMMENT 'SHA-256 des Endpoints. Eindeutiger Schlüssel, weil TEXT selbst nicht indexierbar ist.',
  p256dh         VARCHAR(255) NOT NULL COMMENT 'Öffentlicher Schlüssel des Geräts (Verschlüsselung)',
  auth           VARCHAR(255) NOT NULL COMMENT 'Auth-Geheimnis des Geräts (Verschlüsselung)',
  device_label   VARCHAR(80) DEFAULT NULL COMMENT 'z. B. "Android · Chrome", nur zur Anzeige',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sent_at   DATETIME DEFAULT NULL COMMENT 'Letzte erfolgreiche Zustellung',

  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),

  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Push-Abonnements (Web Push) je Gerät.';

-- Was jemand bekommen möchte. Fehlt die Zeile, gelten die Voreinstellungen
-- aus backend/push/preferences.js.
CREATE TABLE IF NOT EXISTS push_preferences (
  user_id     INT UNSIGNED NOT NULL,
  settings    TEXT NOT NULL COMMENT 'JSON, z. B. {"news":false,"reminderHours":3}',
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id),
  CONSTRAINT fk_push_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Push-Einstellungen je Konto.';

-- Was schon verschickt wurde – damit eine Erinnerung oder Beitrittsanfrage
-- genau einmal kommt, auch nach einem Neustart des Servers.
CREATE TABLE IF NOT EXISTS push_log (
  user_id     INT UNSIGNED NOT NULL,
  dedupe_key  VARCHAR(100) NOT NULL COMMENT 'z. B. "reminder:812"',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id, dedupe_key),
  KEY idx_push_log_created (created_at),

  CONSTRAINT fk_push_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bereits verschickte einmalige Benachrichtigungen. Einträge älter als 30 Tage räumt das Modul weg.';
