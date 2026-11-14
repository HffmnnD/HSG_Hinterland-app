-- ============================================================================
--  HSG Hinterland – Gesamtschema (Stand aller Migrationen)
-- ----------------------------------------------------------------------------
--  ERZEUGT mit `npm run schema:dump` – bitte nicht von Hand ändern.
--  Änderungen am Schema kommen als neue Datei nach db/migrations/, danach
--  `npm run migrate` und `npm run schema:dump`.
--  Letzte enthaltene Migration: 035_rueckbau_und_einstellungen.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `hsg_hinterland` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `hsg_hinterland`;

SET FOREIGN_KEY_CHECKS = 0;

-- app_settings
CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key` varchar(60) NOT NULL,
  `setting_value` varchar(1000) NOT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`),
  KEY `fk_app_settings_user` (`updated_by`),
  CONSTRAINT `fk_app_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vereinsweite Einstellungen. Fehlt ein Schlüssel, gilt der Standard aus backend/settings/index.js.';

-- attendances
CREATE TABLE IF NOT EXISTS `attendances` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  `event_id` int(10) unsigned NOT NULL COMMENT 'FK -> events.id',
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id',
  `status` enum('ATTENDING','DECLINED') NOT NULL COMMENT 'ATTENDING = zugesagt/da | DECLINED = abgesagt/nicht da',
  `reason` varchar(200) DEFAULT NULL COMMENT 'Grund der Abmeldung, z. B. "Krank" oder "Beruflich". PFLICHT bei DECLINED, bei ATTENDING immer NULL.',
  `set_by_user_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> users.id. Wer den Eintrag zuletzt gespeichert hat. Weicht er von user_id ab, hat der/die Trainer:in übersteuert – die Oberfläche weist das aus.',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Zeitpunkt der letzten Änderung. Entscheidet bei einer dauerhaften Abwesenheit, welche Angabe die jüngere und damit gültige ist.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_event_user` (`event_id`,`user_id`),
  KEY `idx_attendances_user` (`user_id`),
  KEY `fk_attendances_setter` (`set_by_user_id`),
  CONSTRAINT `fk_attendances_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendances_setter` FOREIGN KEY (`set_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_attendances_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Zu- und Absagen zu einzelnen Terminen. Keine Zeile = zugesagt.';

-- club_event_responses
CREATE TABLE IF NOT EXISTS `club_event_responses` (
  `event_id` int(10) unsigned NOT NULL,
  `user_id` int(10) unsigned NOT NULL,
  `status` enum('yes','maybe','no') NOT NULL,
  `guests` tinyint(3) unsigned NOT NULL DEFAULT 0 COMMENT 'Begleitpersonen zusätzlich zur Person selbst',
  `note` varchar(200) DEFAULT NULL,
  `set_by` int(10) unsigned DEFAULT NULL COMMENT 'Weicht ab, wenn Eltern für ihr Kind antworten',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`event_id`,`user_id`),
  KEY `idx_club_event_responses_user` (`user_id`),
  KEY `fk_club_event_responses_setter` (`set_by`),
  CONSTRAINT `fk_club_event_responses_event` FOREIGN KEY (`event_id`) REFERENCES `club_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_club_event_responses_setter` FOREIGN KEY (`set_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_club_event_responses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Rückmeldungen zu Vereinsterminen.';

-- club_event_teams
CREATE TABLE IF NOT EXISTS `club_event_teams` (
  `event_id` int(10) unsigned NOT NULL,
  `team_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`event_id`,`team_id`),
  KEY `idx_club_event_teams_team` (`team_id`),
  CONSTRAINT `fk_club_event_teams_event` FOREIGN KEY (`event_id`) REFERENCES `club_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_club_event_teams_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mannschaften, an die sich ein Vereinstermin richtet.';

-- club_events
CREATE TABLE IF NOT EXISTS `club_events` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(120) NOT NULL,
  `description` varchar(4000) DEFAULT NULL COMMENT 'Reiner Text',
  `location` varchar(150) DEFAULT NULL,
  `start_time` datetime NOT NULL COMMENT 'Ortszeit',
  `end_time` datetime NOT NULL COMMENT 'Ortszeit',
  `audience` enum('club','teams') NOT NULL DEFAULT 'club' COMMENT 'club = alle Mitglieder | teams = nur die Mannschaften aus club_event_teams',
  `rsvp_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Wird eine Rückmeldung abgefragt?',
  `response_deadline` datetime DEFAULT NULL COMMENT 'Anmeldefrist (Ortszeit), NULL = bis zum Beginn',
  `allow_guests` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Dürfen Begleitpersonen angemeldet werden?',
  `max_participants` smallint(5) unsigned DEFAULT NULL COMMENT 'Obergrenze inklusive Begleitpersonen, NULL = unbegrenzt',
  `cancelled_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(200) DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_club_events_start` (`start_time`),
  KEY `fk_club_events_creator` (`created_by`),
  CONSTRAINT `fk_club_events_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vereinsveranstaltungen mit optionaler Teilnahme-Abfrage.';

-- duties
CREATE TABLE IF NOT EXISTS `duties` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` int(10) unsigned NOT NULL,
  `category` varchar(30) NOT NULL DEFAULT 'helfer' COMMENT 'Schlüssel aus backend/duties/categories.js – entscheidet, wer den Dienst übernehmen darf.',
  `title` varchar(120) NOT NULL,
  `start_time` datetime NOT NULL COMMENT 'Ortszeit',
  `end_time` datetime NOT NULL COMMENT 'Ortszeit',
  `capacity` smallint(5) unsigned NOT NULL DEFAULT 1 COMMENT 'Benötigte Personen',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_duties_plan` (`plan_id`,`start_time`),
  KEY `idx_duties_start` (`start_time`),
  CONSTRAINT `fk_duties_plan` FOREIGN KEY (`plan_id`) REFERENCES `duty_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Einzelne Dienste eines Dienstplans.';

-- duty_assignments
CREATE TABLE IF NOT EXISTS `duty_assignments` (
  `duty_id` int(10) unsigned NOT NULL,
  `user_id` int(10) unsigned NOT NULL,
  `claimed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) COMMENT 'Serverzeit der Zusage. Entscheidet bei gleichzeitigen Zusagen (zusammen mit der Sperre auf duties).',
  `client_time` datetime(3) DEFAULT NULL COMMENT 'Zeitstempel vom Gerät (UTC), nur zur Nachvollziehbarkeit. Entscheidet nichts.',
  `assigned_by` int(10) unsigned DEFAULT NULL COMMENT 'Gesetzt, wenn ein Admin eingetragen hat',
  PRIMARY KEY (`duty_id`,`user_id`),
  KEY `idx_duty_assignments_user` (`user_id`),
  CONSTRAINT `fk_duty_assignments_duty` FOREIGN KEY (`duty_id`) REFERENCES `duties` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_duty_assignments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Wer welchen Dienst übernimmt.';

-- duty_plans
CREATE TABLE IF NOT EXISTS `duty_plans` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(120) NOT NULL,
  `location` varchar(150) DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft' COMMENT 'Entwürfe sehen nur Admin und Sub-Admin.',
  `published_at` datetime DEFAULT NULL COMMENT 'Erste Veröffentlichung (Ortszeit)',
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_duty_plans_status` (`status`),
  KEY `fk_duty_plans_creator` (`created_by`),
  CONSTRAINT `fk_duty_plans_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dienstpläne (Modul duties).';

-- event_series
CREATE TABLE IF NOT EXISTS `event_series` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel, wird von events.series_id referenziert',
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id. Die Serie gehört genau einer Mannschaft.',
  `title` varchar(120) NOT NULL COMMENT 'Bezeichnung der Serie, z. B. "Training". Wird auf jeden erzeugten Termin übernommen.',
  `type` enum('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH') NOT NULL DEFAULT 'REGULAR_TRAINING' COMMENT 'Terminart der erzeugten Einheiten. Für Serien praktisch immer REGULAR_TRAINING.',
  `location` varchar(120) DEFAULT NULL COMMENT 'Halle / Treffpunkt, z. B. "Halle West". NULL = noch offen.',
  `weekdays` tinyint(3) unsigned NOT NULL COMMENT 'Wochentage als Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64. "Di und Do" ist also 2+8=10. Eine Bitmaske statt einer eigenen Tabelle, weil es genau sieben feste Werte gibt und nie danach gefiltert wird.',
  `start_time` time NOT NULL COMMENT 'Uhrzeit des Trainingsbeginns, gilt für jeden Wochentag der Serie',
  `end_time` time NOT NULL COMMENT 'Uhrzeit des Endes. Liegt sie vor start_time, geht die Einheit über Mitternacht.',
  `starts_on` date NOT NULL COMMENT 'Erster Tag, ab dem Termine erzeugt werden (einschließlich)',
  `ends_on` date NOT NULL COMMENT 'Letzter Tag der Serie (einschließlich), z. B. das Saisonende',
  `reasons_visible_to_all` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Voreinstellung für die erzeugten Termine: dürfen alle Spieler:innen die Abmeldegründe der anderen sehen?',
  `deadline_hours` smallint(5) unsigned DEFAULT NULL COMMENT 'Anmeldefrist der Serie in Stunden vor Beginn. NULL = keine Frist. Wird je Termin in events.response_deadline umgerechnet.',
  `created_by` int(10) unsigned DEFAULT NULL COMMENT 'FK -> users.id. Wer die Serie angelegt hat. NULL, wenn das Konto gelöscht wurde.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Anlagezeitpunkt',
  PRIMARY KEY (`id`),
  KEY `idx_event_series_team` (`team_id`),
  KEY `fk_event_series_author` (`created_by`),
  CONSTRAINT `fk_event_series_author` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_event_series_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Regel einer wiederkehrenden Trainingsserie. Die einzelnen Einheiten stehen in events.';

-- events
CREATE TABLE IF NOT EXISTS `events` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel, wird als event_id referenziert',
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id. Wer den Termin sieht, ergibt sich aus der Mannschaftszugehörigkeit.',
  `series_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> event_series.id, wenn der Termin aus einer Serie stammt. NULL = Einzeltermin. Beim Löschen der Serie bleibt der Termin erhalten (SET NULL) – die Historie darf nicht verschwinden.',
  `nuliga_game_id` varchar(64) DEFAULT NULL COMMENT 'Spiel-ID aus dem nuLiga-Spielplan, wenn dieser Termin von dort übernommen wurde. NULL = von Hand angelegt. Von Hand angelegte Termine fasst der Abgleich nie an.',
  `title` varchar(120) NOT NULL COMMENT 'Bezeichnung, z. B. "Training" oder "Handballcamp"',
  `type` enum('REGULAR_TRAINING','SINGLE_TRAINING','EVENT_CAMP','MATCH') NOT NULL COMMENT 'REGULAR_TRAINING = Einheit aus der festen Trainingsserie | SINGLE_TRAINING = zusätzliches einmaliges Training | EVENT_CAMP = Sondertermin, auch mehrtägig (Camp, Turnier, Feier) | MATCH = Spiel',
  `location` varchar(120) DEFAULT NULL COMMENT 'Halle / Treffpunkt. NULL = noch offen.',
  `start_time` datetime NOT NULL COMMENT 'Beginn in ORTSZEIT (kein UTC). Bewusst DATETIME und nicht TIMESTAMP: ein Training um 19:00 Uhr findet um 19:00 Uhr statt, unabhängig von der Zeitzone des Servers.',
  `end_time` datetime NOT NULL COMMENT 'Ende in Ortszeit. Muss nach start_time liegen. Mehrtägige Termine (Camp) haben hier ein späteres Datum.',
  `reasons_visible_to_all` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'AUS (Standard) = nur der/die Trainer:in sieht die Abmeldegründe, alle anderen sehen lediglich WER fehlt. AN = jede:r in der Mannschaft sieht auch WARUM.',
  `response_deadline` datetime DEFAULT NULL COMMENT 'Anmeldefrist (Ortszeit). Danach ändern nur noch Trainer:innen die Rückmeldung. NULL = bis zum Ende des Termins.',
  `cancelled_at` datetime DEFAULT NULL COMMENT 'Zeitpunkt der Absage (Ortszeit). NULL = findet statt. Gesetzt = der Termin bleibt sichtbar, wird aber als abgesagt gekennzeichnet und in keiner Beteiligungsquote mitgezählt.',
  `cancel_reason` varchar(200) DEFAULT NULL COMMENT 'Kurzer Grund der Absage, z. B. "Halle belegt". Wird allen Mitgliedern der Mannschaft angezeigt – anders als ein persönlicher Abmeldegrund gibt es hier nichts zu schützen.',
  `created_by` int(10) unsigned DEFAULT NULL COMMENT 'FK -> users.id. Wer den Termin angelegt hat. NULL, wenn das Konto gelöscht wurde.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Anlagezeitpunkt',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Letzte Änderung',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_events_nuliga` (`team_id`,`nuliga_game_id`),
  KEY `idx_events_team_start` (`team_id`,`start_time`),
  KEY `idx_events_series` (`series_id`),
  KEY `fk_events_author` (`created_by`),
  CONSTRAINT `fk_events_author` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_events_series` FOREIGN KEY (`series_id`) REFERENCES `event_series` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_events_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Trainingseinheiten, Sondertermine und Spiele einer Mannschaft.';

-- family_child_invites
CREATE TABLE IF NOT EXISTS `family_child_invites` (
  `child_id` int(10) unsigned NOT NULL,
  `code_hash` char(64) NOT NULL COMMENT 'SHA-256 des Codes, der Code selbst steht nirgends',
  `created_by` int(10) unsigned DEFAULT NULL COMMENT 'Elternteil, das den Code erzeugt hat',
  `expires_at` datetime NOT NULL COMMENT 'Ortszeit, danach ungültig',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`child_id`),
  UNIQUE KEY `uq_family_invite_code` (`code_hash`),
  KEY `fk_family_invite_creator` (`created_by`),
  CONSTRAINT `fk_family_invite_child` FOREIGN KEY (`child_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_family_invite_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Einladungscodes, mit denen ein Kind sein Profil als eigenes Konto übernimmt.';

-- family_link_codes
CREATE TABLE IF NOT EXISTS `family_link_codes` (
  `child_id` int(10) unsigned NOT NULL,
  `code_hash` char(64) NOT NULL COMMENT 'SHA-256 des Codes – der Code selbst steht nirgends',
  `expires_at` datetime NOT NULL COMMENT 'Ortszeit, danach ungültig',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`child_id`),
  UNIQUE KEY `uq_family_code` (`code_hash`),
  CONSTRAINT `fk_family_code_child` FOREIGN KEY (`child_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Einmal-Codes zum Verknüpfen von Eltern und Kind.';

-- family_links
CREATE TABLE IF NOT EXISTS `family_links` (
  `parent_id` int(10) unsigned NOT NULL,
  `child_id` int(10) unsigned NOT NULL,
  `created_by` int(10) unsigned DEFAULT NULL COMMENT 'Wer verknüpft hat (Eltern selbst oder Admin)',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`parent_id`,`child_id`),
  KEY `idx_family_child` (`child_id`),
  KEY `fk_family_creator` (`created_by`),
  CONSTRAINT `fk_family_child` FOREIGN KEY (`child_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_family_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_family_parent` FOREIGN KEY (`parent_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Eltern-Kind-Verknüpfungen.';

-- fine_catalog
CREATE TABLE IF NOT EXISTS `fine_catalog` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id',
  `label` varchar(120) NOT NULL COMMENT 'Grund, z. B. Zu spät zum Training',
  `amount_cents` int(10) unsigned NOT NULL COMMENT 'Betrag in Cent',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fine_catalog_team` (`team_id`,`sort_order`),
  CONSTRAINT `fk_fine_catalog_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Standardgründe des Strafenkatalogs je Mannschaft.';

-- fines
CREATE TABLE IF NOT EXISTS `fines` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id',
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id. Wer die Strafe zahlt.',
  `catalog_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> fine_catalog.id, NULL = individueller Eintrag',
  `reason` varchar(160) NOT NULL COMMENT 'Grund im Klartext (Kopie aus dem Katalog oder frei)',
  `amount_cents` int(10) unsigned NOT NULL,
  `fined_on` date NOT NULL COMMENT 'Tag des Anlasses',
  `note` varchar(200) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL COMMENT 'NULL = offen',
  `paid_marked_by` int(10) unsigned DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fines_team` (`team_id`,`fined_on`),
  KEY `idx_fines_user` (`user_id`),
  KEY `fk_fines_catalog` (`catalog_id`),
  KEY `fk_fines_creator` (`created_by`),
  KEY `fk_fines_payer` (`paid_marked_by`),
  CONSTRAINT `fk_fines_catalog` FOREIGN KEY (`catalog_id`) REFERENCES `fine_catalog` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fines_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fines_payer` FOREIGN KEY (`paid_marked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fines_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fines_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Einzelne Strafen der Mannschaftskasse.';

-- library_entries
CREATE TABLE IF NOT EXISTS `library_entries` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `scope` enum('board') NOT NULL DEFAULT 'board' COMMENT 'board = Dokumente unter Verein (Reiter Infos)',
  `team_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> teams.id. Nur bei scope = team gesetzt.',
  `category` varchar(60) DEFAULT NULL COMMENT 'Frei wählbare Rubrik, z. B. Anträge, Hallenordnung, Playbook, Übungen',
  `title` varchar(160) NOT NULL,
  `body` text DEFAULT NULL COMMENT 'Reiner Text (nie HTML). Zeilenumbrüche bleiben erhalten.',
  `link_url` varchar(500) DEFAULT NULL COMMENT 'Optionaler Verweis (https), z. B. auf ein Video oder ein Formular',
  `link_label` varchar(80) DEFAULT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Angeheftete Einträge stehen oben',
  `created_by` int(10) unsigned DEFAULT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_library_scope` (`scope`,`team_id`,`is_pinned`,`updated_at`),
  KEY `fk_library_entries_team` (`team_id`),
  KEY `fk_library_entries_creator` (`created_by`),
  KEY `fk_library_entries_editor` (`updated_by`),
  CONSTRAINT `fk_library_entries_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_library_entries_editor` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_library_entries_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Infothek: Schwarzes Brett, Mannschaftsbereich und Trainerbereich.';

-- library_files
CREATE TABLE IF NOT EXISTS `library_files` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `entry_id` int(10) unsigned NOT NULL COMMENT 'FK -> library_entries.id',
  `file_path` varchar(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. library/ab12.pdf',
  `mime_type` varchar(100) NOT NULL,
  `original_name` varchar(160) DEFAULT NULL COMMENT 'Nur Anzeige- und Download-Name, nie als Pfad benutzt',
  `size_bytes` int(10) unsigned NOT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_library_files_entry` (`entry_id`,`sort_order`),
  CONSTRAINT `fk_library_files_entry` FOREIGN KEY (`entry_id`) REFERENCES `library_entries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dateien eines Infothek-Eintrags.';

-- long_term_absences
CREATE TABLE IF NOT EXISTS `long_term_absences` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id. Wer abwesend ist.',
  `team_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> teams.id. NULL = gilt für ALLE Mannschaften der Person (der Normalfall bei Urlaub und Verletzung). Gesetzt = nur für diese eine Mannschaft.',
  `type` enum('VACATION','INJURY','OTHER') NOT NULL COMMENT 'VACATION = Urlaub | INJURY = Verletzung | OTHER = sonstiger Grund',
  `start_date` date NOT NULL COMMENT 'Erster Tag der Abwesenheit (einschließlich)',
  `end_date` date NOT NULL COMMENT 'Letzter Tag der Abwesenheit (einschließlich). Nie vor start_date.',
  `note` varchar(200) DEFAULT NULL COMMENT 'Freitext, z. B. "Bänderriss" oder "Familienurlaub". Wird als Abmeldegrund angezeigt, sonst greift die Bezeichnung des Typs.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Anlagezeitpunkt. Entscheidet gegen attendances.updated_at, welche Angabe die jüngere und damit gültige ist.',
  PRIMARY KEY (`id`),
  KEY `idx_absences_user_range` (`user_id`,`start_date`,`end_date`),
  KEY `idx_absences_team` (`team_id`),
  CONSTRAINT `fk_absences_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_absences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Urlaub und Verletzungen. Termine im Zeitraum gelten automatisch als abgesagt.';

-- match_report_files
CREATE TABLE IF NOT EXISTS `match_report_files` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `report_id` int(10) unsigned NOT NULL COMMENT 'FK -> match_reports.id',
  `file_path` varchar(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. match-reports/ab12….pdf',
  `mime_type` varchar(50) NOT NULL,
  `original_name` varchar(160) DEFAULT NULL COMMENT 'Nur zur Anzeige/zum Download-Namen, nie als Pfad benutzt',
  `size_bytes` int(10) unsigned NOT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_match_report_files_report` (`report_id`,`sort_order`),
  CONSTRAINT `fk_match_report_files_report` FOREIGN KEY (`report_id`) REFERENCES `match_reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dateien (PDF/Bilder) eines Spielberichts.';

-- match_reports
CREATE TABLE IF NOT EXISTS `match_reports` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id',
  `meeting_id` varchar(12) DEFAULT NULL COMMENT 'nuLiga-/nuScoreLive-Spielnummer (meeting), NULL = ohne Verknüpfung',
  `game_id` varchar(160) DEFAULT NULL COMMENT 'App-Spiel-ID (meeting.group.championship) für den Link zur Spielseite',
  `game_date` date NOT NULL COMMENT 'Spieltag',
  `opponent` varchar(120) NOT NULL,
  `is_home` tinyint(1) DEFAULT NULL COMMENT '1 = Heimspiel, 0 = Auswärtsspiel, NULL = unbekannt',
  `title` varchar(160) NOT NULL,
  `summary` varchar(2000) DEFAULT NULL COMMENT 'Kurzer Text, reiner Text (nie HTML)',
  `body` mediumtext DEFAULT NULL COMMENT 'Berichtstext, reiner Text (nie HTML)',
  `uploaded_by` int(10) unsigned DEFAULT NULL COMMENT 'FK -> users.id, NULL wenn das Konto gelöscht wurde',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_match_reports_team_date` (`team_id`,`game_date`),
  KEY `idx_match_reports_meeting` (`meeting_id`),
  KEY `fk_match_reports_user` (`uploaded_by`),
  CONSTRAINT `fk_match_reports_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_match_reports_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Von Trainer:innen hochgeladene Spielberichte je Mannschaft.';

-- news
CREATE TABLE IF NOT EXISTS `news` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel des Beitrags',
  `title` varchar(150) NOT NULL COMMENT 'Überschrift der Ankündigung (Pflicht, max. 150 Zeichen)',
  `subtitle` varchar(200) DEFAULT NULL COMMENT 'Untertitel unter der Überschrift',
  `content` mediumtext NOT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Archiviert (1) oder aktiv (0). Archivierte Beiträge verschwinden aus dem Dashboard-Feed, bleiben in der Verwaltung unter "Archiv" aber vollständig erhalten und lassen sich zurückholen. Endgültiges Löschen bleibt als getrennte, bewusste Aktion bestehen.',
  `author_id` int(10) unsigned DEFAULT NULL COMMENT 'FK -> users.id. Wer den Beitrag verfasst hat. NULL, wenn das Konto später gelöscht wurde (ON DELETE SET NULL) – der Beitrag bleibt erhalten.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Veröffentlichungszeitpunkt. Sortierkriterium im News-Feed (absteigend).',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Letzte Änderung des Beitrags',
  `audience` enum('club','teams') NOT NULL DEFAULT 'club' COMMENT 'club = alle Mitglieder | teams = nur die Mannschaften aus news_teams',
  `link_url` varchar(500) DEFAULT NULL COMMENT 'Optionaler Verweis (https), z. B. Livestream',
  `link_kind` enum('link','livestream','video') NOT NULL DEFAULT 'link' COMMENT 'Art des Verweises – bestimmt Beschriftung und Symbol',
  PRIMARY KEY (`id`),
  KEY `idx_news_created` (`created_at`),
  KEY `idx_news_author` (`author_id`),
  KEY `idx_news_archived_created` (`is_archived`,`created_at`),
  CONSTRAINT `fk_news_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vereins-News und Ankündigungen. Erstellen/Löschen nur admin & sub_admin, Lesen alle angemeldeten Mitglieder.';

-- news_files
CREATE TABLE IF NOT EXISTS `news_files` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `news_id` int(10) unsigned NOT NULL COMMENT 'FK -> news.id',
  `file_path` varchar(255) NOT NULL COMMENT 'Relativ zu backend/uploads, z. B. news-files/ab12.pdf',
  `mime_type` varchar(100) NOT NULL,
  `original_name` varchar(160) DEFAULT NULL,
  `size_bytes` int(10) unsigned NOT NULL,
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_news_files_news` (`news_id`,`sort_order`),
  CONSTRAINT `fk_news_files_news` FOREIGN KEY (`news_id`) REFERENCES `news` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dokumente und Videos eines Beitrags.';

-- news_images
CREATE TABLE IF NOT EXISTS `news_images` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  `news_id` int(10) unsigned NOT NULL COMMENT 'FK -> news.id. Wird der Beitrag gelöscht, verschwinden die Zeilen mit (ON DELETE CASCADE). Die DATEIEN räumt der Controller weg – dafür liest er die Pfade vor dem Löschen aus.',
  `image_path` varchar(255) NOT NULL COMMENT 'Relativer Pfad innerhalb von backend/uploads/, z. B. "news/ab12cd34.jpg". Ausgeliefert über /api/uploads/<pfad>.',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0 COMMENT 'Anzeigereihenfolge innerhalb des Beitrags, kleinste Zahl zuerst. Vergibt der Server beim Anlegen (0, 1, 2 …).',
  PRIMARY KEY (`id`),
  KEY `idx_news_images_news` (`news_id`,`sort_order`),
  CONSTRAINT `fk_news_images_news` FOREIGN KEY (`news_id`) REFERENCES `news` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bilder eines Vereins-Beitrags. Beliebig viele je Beitrag, Reihenfolge über sort_order.';

-- news_teams
CREATE TABLE IF NOT EXISTS `news_teams` (
  `news_id` int(10) unsigned NOT NULL,
  `team_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`news_id`,`team_id`),
  KEY `idx_news_teams_team` (`team_id`),
  CONSTRAINT `fk_news_teams_news` FOREIGN KEY (`news_id`) REFERENCES `news` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_news_teams_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mannschaften, für die ein Beitrag veröffentlicht wurde.';

-- push_log
CREATE TABLE IF NOT EXISTS `push_log` (
  `user_id` int(10) unsigned NOT NULL,
  `dedupe_key` varchar(100) NOT NULL COMMENT 'z. B. "reminder:812"',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`dedupe_key`),
  KEY `idx_push_log_created` (`created_at`),
  CONSTRAINT `fk_push_log_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bereits verschickte einmalige Benachrichtigungen. Einträge älter als 30 Tage räumt das Modul weg.';

-- push_preferences
CREATE TABLE IF NOT EXISTS `push_preferences` (
  `user_id` int(10) unsigned NOT NULL,
  `settings` text NOT NULL COMMENT 'JSON, z. B. {"news":false,"reminderHours":3}',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_push_preferences_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Push-Einstellungen je Konto.';

-- push_subscriptions
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id. Wechselt, wenn sich am selben Gerät jemand anderes anmeldet.',
  `endpoint` text NOT NULL COMMENT 'Adresse beim Push-Dienst des Browsers (Google, Mozilla, Apple, Microsoft).',
  `endpoint_hash` char(64) NOT NULL COMMENT 'SHA-256 des Endpoints. Eindeutiger Schlüssel, weil TEXT selbst nicht indexierbar ist.',
  `p256dh` varchar(255) NOT NULL COMMENT 'Öffentlicher Schlüssel des Geräts (Verschlüsselung)',
  `auth` varchar(255) NOT NULL COMMENT 'Auth-Geheimnis des Geräts (Verschlüsselung)',
  `device_label` varchar(80) DEFAULT NULL COMMENT 'z. B. "Android · Chrome", nur zur Anzeige',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_sent_at` datetime DEFAULT NULL COMMENT 'Letzte erfolgreiche Zustellung',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_endpoint` (`endpoint_hash`),
  KEY `idx_push_user` (`user_id`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Push-Abonnements (Web Push) je Gerät.';

-- role_permissions
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` int(10) unsigned NOT NULL,
  `permission` varchar(60) NOT NULL COMMENT 'Schlüssel aus backend/access/permissions.js',
  PRIMARY KEY (`role_id`,`permission`),
  CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Rechte je Rolle.';

-- roles
CREATE TABLE IF NOT EXISTS `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `role_key` varchar(40) NOT NULL COMMENT 'Technischer Schlüssel. Bei Systemrollen identisch mit dem Wert in users.role.',
  `name` varchar(60) NOT NULL COMMENT 'Anzeigename, z. B. "Jugendleitung"',
  `description` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Systemrolle: Schlüssel fest, nicht löschbar',
  `is_superuser` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Hat immer alle Rechte',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 100,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Rollen im Verein (Bündel von Rechten).';

-- schema_migrations
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `filename` varchar(255) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- team_favorites
CREATE TABLE IF NOT EXISTS `team_favorites` (
  `user_id` int(10) unsigned NOT NULL,
  `team_id` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`team_id`),
  KEY `idx_team_favorites_team` (`team_id`),
  CONSTRAINT `fk_team_favorites_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_team_favorites_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Lieblingsmannschaften je Person.';

-- team_sponsors
CREATE TABLE IF NOT EXISTS `team_sponsors` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel',
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id',
  `name` varchar(100) NOT NULL COMMENT 'Name des Sponsors, wie er auf der Mannschaftsseite steht',
  `website_url` varchar(255) DEFAULT NULL COMMENT 'Optionale Website des Sponsors (nur http/https). NULL = nicht verlinkt.',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0 COMMENT 'Anzeigereihenfolge, kleinste Zahl zuerst. Haupt-Sponsor also 0.',
  PRIMARY KEY (`id`),
  KEY `idx_team_sponsors_team` (`team_id`,`sort_order`),
  CONSTRAINT `fk_team_sponsors_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sponsoren je Mannschaft für den Kopfbereich der Mannschaftsseite. ON DELETE CASCADE.';

-- teams
CREATE TABLE IF NOT EXISTS `teams` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel, wird als team_id referenziert',
  `name` varchar(100) NOT NULL COMMENT 'Ausgeschriebener Name, z. B. "Männliche Jugend C"',
  `age_group` varchar(40) DEFAULT NULL COMMENT 'Altersklasse / Jugend, z. B. "A-Jugend", "Minis" oder "Erwachsene". Frei formulierbar, weil die Verbände die Bezeichnungen regelmäßig ändern. NULL = nicht angegeben.',
  `gender` enum('male','female','mixed') DEFAULT NULL COMMENT 'Geschlecht der Mannschaft: male = männlich | female = weiblich | mixed = gemischt. NULL = nicht angegeben.',
  `sort_order` smallint(5) unsigned NOT NULL DEFAULT 0 COMMENT 'Anzeigereihenfolge im Frontend, kleinste Zahl zuerst. Bei Gleichstand entscheidet der Name. Ersetzt die bisherige Sortierung nach `id`.',
  `code` varchar(20) NOT NULL COMMENT 'Kurzkürzel für URLs und Chips, z. B. "MJC". Eindeutig, immer GROSS.',
  `handball_team_id` varchar(255) DEFAULT NULL,
  `photo_path` varchar(255) DEFAULT NULL COMMENT 'Relativer Pfad des Mannschaftsfotos innerhalb von backend/uploads/, z. B. "teams/ab12cd34.jpg". Ausgeliefert über /api/uploads/<pfad>. NULL = kein Foto, der Kopfbereich zeigt dann eine gestaltete Fläche.',
  `photo_focus_x` tinyint(3) unsigned NOT NULL DEFAULT 50 COMMENT 'Waagerechter Bildmittelpunkt im Banner in Prozent (0 = ganz links, 100 = ganz rechts). Entspricht object-position.',
  `photo_focus_y` tinyint(3) unsigned NOT NULL DEFAULT 50 COMMENT 'Senkrechter Bildmittelpunkt im Banner in Prozent (0 = Oberkante, 100 = Unterkante). Damit rutschen Köpfe ins Bild.',
  `photo_zoom` smallint(5) unsigned NOT NULL DEFAULT 100 COMMENT 'Vergrößerung des Fotos im Banner in Prozent (100 = einpassen, 300 = dreifach). Ganzzahl statt Kommazahl – reicht für einen Schieberegler und rechnet exakt.',
  `nuliga_sync_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Sollen die Ligaspiele aus nuLiga als Termine im Kalender stehen? Standard aus – eine Mannschaft ohne Ligabetrieb soll nicht plötzlich fremde Spiele anzeigen. Wird im Planungsbereich vom Trainerteam gesetzt.',
  `nuliga_synced_at` datetime DEFAULT NULL COMMENT 'Zeitpunkt des letzten erfolgreichen Abgleichs mit nuLiga (Ortszeit). NULL = noch nie abgeglichen. Steuert, wann im Hintergrund erneut geholt wird.',
  `fines_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = Strafen und Kasse sind für diese Mannschaft sichtbar',
  `planner_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 = Teamplaner (Zu- und Absagen) wird genutzt',
  `join_mode` enum('approval','open') NOT NULL DEFAULT 'approval' COMMENT 'approval = Trainer bestätigt Beitritte, open = sofort im Kader',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teams_code` (`code`),
  KEY `idx_teams_sort` (`sort_order`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stammdaten der Mannschaften. Wird per Seed unten befüllt.';

-- ticker_event_times
CREATE TABLE IF NOT EXISTS `ticker_event_times` (
  `meeting_id` varchar(12) NOT NULL COMMENT 'nuScoreLive-Spielnummer',
  `event_idx` int(10) unsigned NOT NULL COMMENT 'Laufende Nummer der Aktion (idx) bei nuScoreLive',
  `event_code` tinyint(3) unsigned DEFAULT NULL COMMENT 'nuScoreLive-Ereigniscode (0–19) zur Kontrolle',
  `observed_at` datetime(3) NOT NULL COMMENT 'Empfangszeit beim Backend (UTC)',
  `source` enum('push','rest') NOT NULL COMMENT 'push = per WebSocket, rest = beim ersten Abruf während des Spiels',
  PRIMARY KEY (`meeting_id`,`event_idx`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Live beobachtete Uhrzeit je Ticker-Aktion (nur was wirklich live empfangen wurde).';

-- user_permissions
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` int(10) unsigned NOT NULL,
  `permission` varchar(60) NOT NULL,
  `effect` enum('grant','deny') NOT NULL,
  `assigned_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`permission`),
  KEY `fk_user_permissions_assigner` (`assigned_by`),
  CONSTRAINT `fk_user_permissions_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_permissions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Einzelrechte je Person: grant ergänzt, deny entzieht.';

-- user_roles
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` int(10) unsigned NOT NULL,
  `role_id` int(10) unsigned NOT NULL,
  `assigned_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `idx_user_roles_role` (`role_id`),
  KEY `fk_user_roles_assigner` (`assigned_by`),
  CONSTRAINT `fk_user_roles_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Zusatzrollen je Person (die Grundrolle steht in users.role).';

-- user_services
CREATE TABLE IF NOT EXISTS `user_services` (
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id',
  `service_type` enum('zeitnehmer','verkaufsdienst') NOT NULL COMMENT 'Angebotener Helferdienst',
  PRIMARY KEY (`user_id`,`service_type`),
  CONSTRAINT `fk_user_services_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Welche Helferdienste ein "Mitwirkender" übernimmt. ON DELETE CASCADE.';

-- user_teams
CREATE TABLE IF NOT EXISTS `user_teams` (
  `user_id` int(10) unsigned NOT NULL COMMENT 'FK -> users.id',
  `team_id` int(10) unsigned NOT NULL COMMENT 'FK -> teams.id',
  `relation_type` enum('player','coach','fan') NOT NULL DEFAULT 'player' COMMENT 'Art der Beziehung: player = spielt in der Mannschaft | coach = trainiert sie (darf ihren Kader verwalten) | fan = interessiert sich für sie',
  `jersey_number` tinyint(3) unsigned DEFAULT NULL COMMENT 'Rückennummer in DIESER Mannschaft (1-99). NULL = keine feste Nummer, die Kaderkarte zeigt dann die Initialen.',
  `position` enum('tor','rueckraum','aussen','kreis') DEFAULT NULL COMMENT 'Spielposition in DIESER Mannschaft: tor = Torwart:in | rueckraum = Rückraum | aussen = Außen | kreis = Kreisläufer:in. NULL = nicht angegeben (Kaderfilter zeigt die Karte trotzdem unter "Alle").',
  `staff_title` varchar(60) DEFAULT NULL COMMENT 'Freie Bezeichnung im Trainer-/Betreuerstab, z. B. "Co-Trainer" oder "Betreuerin". Nur für relation_type = coach sinnvoll. NULL -> die Seite zeigt schlicht "Trainer:in".',
  `is_confirmed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Vom Trainer bestätigt (1) oder offene Beitrittsanfrage (0). player/coach starten mit 0, fan wird direkt mit 1 angelegt.',
  PRIMARY KEY (`user_id`,`team_id`,`relation_type`),
  KEY `idx_user_teams_team` (`team_id`),
  KEY `idx_user_teams_user` (`user_id`),
  CONSTRAINT `fk_user_teams_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_teams_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Verknüpfung Mitglied<->Mannschaft. Löscht ein Mitglied/Team, verschwinden die Zuordnungen automatisch (ON DELETE CASCADE).';

-- users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primärschlüssel, wird überall als user_id referenziert',
  `first_name` varchar(100) NOT NULL COMMENT 'Vorname (Pflicht, max. 100 Zeichen)',
  `last_name` varchar(100) NOT NULL COMMENT 'Nachname (Pflicht, max. 100 Zeichen)',
  `email` varchar(255) NOT NULL COMMENT 'E-Mail = Login-Name. Immer klein/getrimmt gespeichert. Eindeutig.',
  `photo_path` varchar(255) DEFAULT NULL COMMENT 'Relativer Pfad des Profilbildes in backend/uploads/, z. B. "users/ab12.jpg". Ausgeliefert über /api/uploads/<pfad>. NULL = Initialen anzeigen.',
  `phone` varchar(30) DEFAULT NULL COMMENT 'Freiwillige Telefonnummer aus den Kontoeinstellungen. Kontakt neben der E-Mail: bei Trainer:innen sichtbar für die Mitglieder ihrer Mannschaft, bei Spieler:innen nur für das Trainerteam.',
  `password_hash` varchar(255) NOT NULL COMMENT 'bcrypt-Hash des Passworts. Nie im Klartext, nie an den Client.',
  `sessions_valid_from` int(10) unsigned NOT NULL DEFAULT 0 COMMENT 'Unix-Zeit (Sekunden), ab der ausgestellte Tokens gelten. Wird beim Passwortwechsel auf JETZT gesetzt und beendet damit alle anderen Sitzungen. 0 = nie gesetzt, alle Tokens gelten.',
  `is_approved` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Konto aktiv (1) oder von einem Admin gesperrt (0). Standard 1 – es gibt KEINE Registrierungs-Freigabe. Wird bei Login, Session (/me) und RBAC geprüft, damit eine Sperre sofort greift.',
  `is_managed` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Kinderprofil ohne eigenen Login (von Eltern angelegt). Anmelden ist damit nicht möglich.',
  `role` enum('admin','sub_admin','trainer','spieler','zuschauer') NOT NULL DEFAULT 'spieler' COMMENT 'RBAC-Rolle. admin = Vollzugriff | sub_admin = wie admin, aber ohne Zugriff auf admin-Konten und ohne admin-Vergabe | trainer = Mitgliederliste + Mannschaftszuordnung | spieler/zuschauer = nur lesen. Wird NICHT bei der Registrierung gesetzt, sondern vom Admin bei der Freigabe.',
  `theme` enum('system','light','dark') NOT NULL DEFAULT 'system' COMMENT 'Design-Vorliebe: system = dem Gerät folgen | light | dark. Wird im Onboarding gesetzt und unter „Mein Konto" geändert.',
  `home_layout` varchar(500) DEFAULT NULL COMMENT 'Startseite als JSON, z. B. {"order":["next","calendar"],"hidden":["news"]}. NULL = Standard',
  `calendar_token` char(43) DEFAULT NULL COMMENT 'Geheimer Schlüssel der Kalender-Abo-Adresse (32 Zufallsbytes, base64url). NULL = kein Abo.',
  `onboarding_completed_at` datetime DEFAULT NULL COMMENT 'Zeitpunkt, zu dem der Onboarding-Assistent abgeschlossen wurde (Ortszeit). NULL = steht beim nächsten Login an.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Zeitpunkt der Registrierung',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_calendar_token` (`calendar_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Vereinsmitglieder und ihre Login-Daten. Zentrale Tabelle des Systems.';

SET FOREIGN_KEY_CHECKS = 1;

-- Stammdaten: Rollen und ihre Rechte
INSERT IGNORE INTO `roles` VALUES
  (1, 'admin', 'Admin', 'Vollzugriff auf alle Funktionen, inklusive Rollen und Rechte.', 1, 1, 10, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (2, 'sub_admin', 'Hauptuser', 'Verwaltet Mitglieder, Mannschaften, News, Dienste, Schwarzes Brett und Vereinstermine. Keine Rechtevergabe.', 1, 0, 20, '2026-11-05 20:33:52', '2026-11-12 18:25:36'),
  (3, 'trainer', 'Trainer:in', 'Sieht die Mitgliederliste, um Spieler:innen der eigenen Mannschaften zuzuordnen.', 1, 0, 30, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (4, 'spieler', 'Spieler:in', 'Aktives Mitglied einer Mannschaft.', 1, 0, 40, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (5, 'zuschauer', 'Zuschauer:in', 'Fan oder Unterstützer:in ohne eigene Mannschaft.', 1, 0, 50, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (6, 'vorstand', 'Vorstand', 'Überblick über den Verein, News und Rundnachrichten.', 0, 0, 60, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (7, 'jugendleitung', 'Jugendleitung', 'Betreut alle Jugendmannschaften, Eltern-Kind-Verknüpfungen und Rundnachrichten.', 0, 0, 70, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (8, 'dienstplanung', 'Dienstplanung', 'Erstellt und verwaltet Dienstpläne.', 0, 0, 80, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (9, 'presse', 'Presse & Medien', 'Veröffentlicht Vereins-News.', 0, 0, 90, '2026-11-05 20:33:52', '2026-11-05 20:33:52'),
  (10, 'eventplanung', 'Eventplanung', 'Plant Vereinsveranstaltungen und verfolgt die Rückmeldungen.', 0, 0, 85, '2026-11-12 18:25:36', '2026-11-12 18:25:36');

INSERT IGNORE INTO `role_permissions` VALUES
  (2, 'board.manage'),
  (2, 'duties.manage'),
  (2, 'events.manage'),
  (2, 'family.manage'),
  (2, 'members.contact'),
  (2, 'members.edit'),
  (2, 'members.lock'),
  (2, 'members.roles'),
  (2, 'members.view'),
  (2, 'news.manage'),
  (2, 'settings.manage'),
  (2, 'system.view'),
  (2, 'teams.create'),
  (2, 'teams.edit'),
  (2, 'teams.manage_all'),
  (3, 'members.view'),
  (6, 'board.manage'),
  (6, 'events.manage'),
  (6, 'members.contact'),
  (6, 'members.view'),
  (6, 'news.manage'),
  (7, 'events.manage'),
  (7, 'family.manage'),
  (7, 'members.contact'),
  (7, 'members.edit'),
  (7, 'members.view'),
  (7, 'teams.manage_all'),
  (8, 'duties.manage'),
  (9, 'news.manage'),
  (10, 'events.manage');

-- Wer dieses Schema direkt einspielt, hat den Stand ALLER Migrationen –
-- `npm run migrate` soll sie danach nicht noch einmal ausführen.
INSERT IGNORE INTO schema_migrations (filename) VALUES
  ('001_initial_schema.sql'),
  ('002_team_confirmation.sql'),
  ('003_activate_existing_accounts.sql'),
  ('004_news_table.sql'),
  ('005_team_page.sql'),
  ('006_admin_console.sql'),
  ('007_news_second_image.sql'),
  ('008_news_images_table.sql'),
  ('009_schedule_module.sql'),
  ('010_nuliga_games.sql'),
  ('011_event_cancellation.sql'),
  ('012_nuliga_key_cleanup.sql'),
  ('013_onboarding_theme.sql'),
  ('014_instant_signup_and_profile.sql'),
  ('015_session_invalidation.sql'),
  ('016_push_notifications.sql'),
  ('017_duty_roster.sql'),
  ('018_calendar_feed_and_settings.sql'),
  ('019_roles_and_permissions.sql'),
  ('020_family_links.sql'),
  ('021_messages_favorites_home.sql'),
  ('022_spielberichte_und_ticker_zeiten.sql'),
  ('023_familie_einladungscodes.sql'),
  ('030_infothek.sql'),
  ('031_strafenkatalog.sql'),
  ('032_vereinstermine_und_fristen.sql'),
  ('033_news_zielgruppen_und_anhaenge.sql'),
  ('034_freigabe_und_rollen.sql'),
  ('035_rueckbau_und_einstellungen.sql');
