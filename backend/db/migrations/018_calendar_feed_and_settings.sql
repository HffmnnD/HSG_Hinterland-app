-- ============================================================================
--  Migration 018 – Kalender-Abo und Vereinseinstellungen
-- ----------------------------------------------------------------------------
--    users.calendar_token  geheimer Teil der Abo-Adresse (iCal). Kalender-Apps
--                          schicken kein Login-Cookie mit, deshalb steckt die
--                          Berechtigung in der Adresse, wie beim Google Kalender
--                          („Privatadresse im iCal-Format"). NULL = noch kein
--                          Abo. Ein neuer Link macht den alten ungültig.
--    app_settings          Einstellungen für den ganzen Verein (Schlüssel/Wert),
--                          zuerst: wer die Namen bei Diensten sieht.
--
--  Entfernen:
--    DROP TABLE IF EXISTS app_settings;
--    ALTER TABLE users DROP COLUMN calendar_token;
--    DELETE FROM schema_migrations WHERE filename = '018_calendar_feed_and_settings.sql';
-- ============================================================================

ALTER TABLE users
  ADD COLUMN calendar_token CHAR(43) DEFAULT NULL
      COMMENT 'Geheimer Schlüssel der Kalender-Abo-Adresse (32 Zufallsbytes, base64url). NULL = kein Abo.'
      AFTER wants_duties,
  ADD UNIQUE KEY uq_users_calendar_token (calendar_token);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key    VARCHAR(60)  NOT NULL,
  setting_value  VARCHAR(255) NOT NULL,
  updated_by     INT UNSIGNED DEFAULT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_app_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Vereinsweite Einstellungen. Fehlt ein Schlüssel, gilt der Standard aus backend/settings/index.js.';
