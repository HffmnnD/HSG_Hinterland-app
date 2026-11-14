-- ============================================================================
--  Migration 035 – Rückbau nach dem Test vom 2026-11-13, neue Einstellungen
-- ----------------------------------------------------------------------------
--  Entfernt (Funktionen wurden aus der App gelöscht):
--    messages, message_recipients    Postfach / Trainer-Nachrichten
--    users.approval_pending          Freigabe neuer Konten (jedes Konto ist
--                                    sofort freigegeben)
--    users.wants_duties              Schalter „Ich helfe bei Diensten mit"
--    library_entries scope team und trainer
--                                    Mannschafts- und Trainerbereich der
--                                    Infothek (übrig bleibt scope board =
--                                    Dokumente unter Verein, Reiter Infos)
--    Rechte members.approve, messages.broadcast, trainer_area.manage
--    app_settings registration_mode
--
--  Neu:
--    match_reports.body          langer Berichtstext (Spielberichte erscheinen
--                                unter Verein, Reiter Infos, und auf der
--                                Spielseite). Dateien sind jetzt optional.
--    teams.fines_enabled         Strafenkatalog/Kasse für diese Mannschaft an/aus
--    teams.planner_enabled       Teamplaner (Zu-/Absagen) für diese Mannschaft an/aus
--    teams.join_mode             approval = Trainer:in bestätigt Beitritte,
--                                open = Spieler:innen sind sofort im Kader
--    app_settings.setting_value  länger (Login-Sprüche der App-Einstellungen)
--    news.subtitle               Untertitel, news.content ohne 5000-Zeichen-Grenze
--
--  Die Dateien gelöschter Infothek-Einträge räumt `npm run uploads:sweep` auf.
--  Kein Semikolon in Kommentaren unterhalb dieses Kopfes (der Runner trennt
--  an Semikolons).
-- ============================================================================

DROP TABLE IF EXISTS message_recipients;
DROP TABLE IF EXISTS messages;

ALTER TABLE users DROP INDEX idx_users_approval_pending;
ALTER TABLE users DROP COLUMN approval_pending;
ALTER TABLE users DROP COLUMN wants_duties;

DELETE FROM library_entries WHERE scope IN ('team', 'trainer');
ALTER TABLE library_entries
  MODIFY scope ENUM('board') NOT NULL DEFAULT 'board'
    COMMENT 'board = Dokumente unter Verein (Reiter Infos)';

DELETE FROM role_permissions WHERE permission IN ('members.approve', 'messages.broadcast', 'trainer_area.manage');
DELETE FROM user_permissions WHERE permission IN ('members.approve', 'messages.broadcast', 'trainer_area.manage');
DELETE FROM app_settings WHERE setting_key = 'registration_mode';

ALTER TABLE app_settings
  MODIFY setting_value VARCHAR(1000) NOT NULL;

ALTER TABLE match_reports
  ADD COLUMN body MEDIUMTEXT DEFAULT NULL
    COMMENT 'Berichtstext, reiner Text (nie HTML)' AFTER summary;

ALTER TABLE teams
  ADD COLUMN fines_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = Strafen und Kasse sind für diese Mannschaft sichtbar',
  ADD COLUMN planner_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = Teamplaner (Zu- und Absagen) wird genutzt',
  ADD COLUMN join_mode ENUM('approval','open') NOT NULL DEFAULT 'approval'
    COMMENT 'approval = Trainer bestätigt Beitritte, open = sofort im Kader';

ALTER TABLE news
  ADD COLUMN subtitle VARCHAR(200) DEFAULT NULL
    COMMENT 'Untertitel unter der Überschrift' AFTER title,
  MODIFY content MEDIUMTEXT NOT NULL;
