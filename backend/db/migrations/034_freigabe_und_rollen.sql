-- ============================================================================
--  Migration 034 – Freigabe neuer Konten, Rollen nach Lastenheft
-- ----------------------------------------------------------------------------
--  Lastenheft 1.5: Selbstregistrierung, die Freigabe erfolgt durch einen
--  Hauptnutzer oder Administrator.
--
--    users.approval_pending   1 = Konto wartet auf Freigabe. Die Person kann
--                             sich anmelden und ihr Profil einrichten, sieht
--                             aber noch keine Vereinsinhalte.
--                             (is_approved = 0 bleibt die Sperre durch Admins.)
--
--  Ob neue Konten überhaupt eine Freigabe brauchen, ist eine Vereinseinstellung
--  (app_settings: registration_mode = approval | open, Standard approval).
--  Bestehende Konten bleiben unverändert freigegeben.
--
--  Lastenheft 3: Administrator, Hauptuser, Trainer, Spieler, Zuschauer.
--  Die Systemrolle sub_admin heißt deshalb ab jetzt „Hauptuser" (der Schlüssel
--  bleibt). Dazu kommen die Rechte der neuen Bereiche und eine Vereinsrolle
--  für die Planung von Veranstaltungen.
--
--  Entfernen:
--    ALTER TABLE users DROP COLUMN approval_pending
--    DELETE FROM schema_migrations WHERE filename = '034_freigabe_und_rollen.sql'
-- ============================================================================

ALTER TABLE users
  ADD COLUMN approval_pending TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = wartet nach der Registrierung auf Freigabe durch Hauptuser oder Admin';

ALTER TABLE users
  ADD KEY idx_users_approval_pending (approval_pending);

UPDATE roles
   SET name = 'Hauptuser',
       description = 'Verwaltet Mitglieder, Mannschaften, News, Dienste, Schwarzes Brett und Vereinstermine. Keine Rechtevergabe.'
 WHERE role_key = 'sub_admin' AND name = 'Sub-Admin';

INSERT INTO roles (role_key, name, description, is_system, is_superuser, sort_order) VALUES
  ('eventplanung', 'Eventplanung', 'Plant Vereinsveranstaltungen und verfolgt die Rückmeldungen.', 0, 0, 85)
ON DUPLICATE KEY UPDATE role_key = role_key;

INSERT IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
  FROM roles r
  JOIN (
              SELECT 'sub_admin' AS role_key, 'members.approve' AS permission
    UNION ALL SELECT 'sub_admin', 'board.manage'
    UNION ALL SELECT 'sub_admin', 'trainer_area.manage'
    UNION ALL SELECT 'sub_admin', 'events.manage'
    UNION ALL SELECT 'trainer', 'trainer_area.manage'
    UNION ALL SELECT 'vorstand', 'board.manage'
    UNION ALL SELECT 'vorstand', 'events.manage'
    UNION ALL SELECT 'vorstand', 'members.approve'
    UNION ALL SELECT 'jugendleitung', 'trainer_area.manage'
    UNION ALL SELECT 'jugendleitung', 'events.manage'
    UNION ALL SELECT 'eventplanung', 'events.manage'
  ) p ON p.role_key = r.role_key;
