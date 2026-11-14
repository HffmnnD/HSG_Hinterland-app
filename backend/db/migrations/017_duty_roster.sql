-- ============================================================================
--  Migration 017 – Dienstplan (Modul backend/duties/)
-- ----------------------------------------------------------------------------
--  Helferdienste wie Kuchenverkauf oder Kasse: Admin und Sub-Admin legen
--  Dienstpläne an, Mitglieder tragen sich selbst ein.
--
--    duty_plans        ein Plan, z. B. „Heimspieltag 18.10."
--    duties            einzelne Dienste darin (Zeit, Plätze, Kategorie)
--    duty_assignments  wer welchen Dienst übernimmt
--    users.wants_duties  „Ich helfe bei Diensten mit" (Push bei neuen Plänen)
--
--  Wie Push bewusst NICHT in db/schema.sql: Nach einem Import von schema.sql
--  spielt `npm run migrate` diese Datei nach.
--
--  Entfernen:
--    DROP TABLE IF EXISTS duty_assignments, duties, duty_plans;
--    ALTER TABLE users DROP COLUMN wants_duties;
--    DELETE FROM schema_migrations WHERE filename = '017_duty_roster.sql';
-- ============================================================================

ALTER TABLE users
  ADD COLUMN wants_duties TINYINT(1) NOT NULL DEFAULT 0
      COMMENT 'Hilft bei Diensten mit (Onboarding / Mein Konto). Steuert die Push-Nachricht zu neuen Dienstplänen. Eintragen darf sich jedes Mitglied.'
      AFTER theme;

-- Wer schon Zeitnehmer oder Verkaufsdienst hinterlegt hat, hilft offenbar mit.
UPDATE users SET wants_duties = 1
 WHERE id IN (SELECT user_id FROM user_services);

CREATE TABLE IF NOT EXISTS duty_plans (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title         VARCHAR(120) NOT NULL,
  location      VARCHAR(150) DEFAULT NULL,
  notes         VARCHAR(1000) DEFAULT NULL,
  status        ENUM('draft','published') NOT NULL DEFAULT 'draft'
                COMMENT 'Entwürfe sehen nur Admin und Sub-Admin.',
  published_at  DATETIME DEFAULT NULL COMMENT 'Erste Veröffentlichung (Ortszeit)',
  created_by    INT UNSIGNED DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_duty_plans_status (status),
  CONSTRAINT fk_duty_plans_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dienstpläne (Modul duties).';

CREATE TABLE IF NOT EXISTS duties (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id     INT UNSIGNED NOT NULL,
  category    VARCHAR(30) NOT NULL DEFAULT 'helfer'
              COMMENT 'Schlüssel aus backend/duties/categories.js – entscheidet, wer den Dienst übernehmen darf.',
  title       VARCHAR(120) NOT NULL,
  start_time  DATETIME NOT NULL COMMENT 'Ortszeit',
  end_time    DATETIME NOT NULL COMMENT 'Ortszeit',
  capacity    SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Benötigte Personen',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_duties_plan (plan_id, start_time),
  KEY idx_duties_start (start_time),
  CONSTRAINT fk_duties_plan FOREIGN KEY (plan_id) REFERENCES duty_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Einzelne Dienste eines Dienstplans.';

CREATE TABLE IF NOT EXISTS duty_assignments (
  duty_id      INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  claimed_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
               COMMENT 'Serverzeit der Zusage. Entscheidet bei gleichzeitigen Zusagen (zusammen mit der Sperre auf duties).',
  client_time  DATETIME(3) DEFAULT NULL
               COMMENT 'Zeitstempel vom Gerät (UTC), nur zur Nachvollziehbarkeit. Entscheidet nichts.',
  assigned_by  INT UNSIGNED DEFAULT NULL COMMENT 'Gesetzt, wenn ein Admin eingetragen hat',

  PRIMARY KEY (duty_id, user_id),
  KEY idx_duty_assignments_user (user_id),
  CONSTRAINT fk_duty_assignments_duty FOREIGN KEY (duty_id) REFERENCES duties(id) ON DELETE CASCADE,
  CONSTRAINT fk_duty_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Wer welchen Dienst übernimmt.';
