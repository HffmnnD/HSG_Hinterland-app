-- ============================================================================
--  Migration 014 – Sofort aktive Registrierung, Profilbild und Telefonnummer
-- ----------------------------------------------------------------------------
--  1. Keine Freigabe mehr
--     Migration 013 hatte neue Konten auf eine Freigabe durch die Verwaltung
--     warten lassen. Das wird zurückgenommen: Wer sich registriert, ist sofort
--     angemeldet und landet direkt im Onboarding-Assistenten. Damit entfällt
--     auch `approved_at` – es gab nur die beiden Fälle „wartet" und „gesperrt"
--     auseinander.
--
--     `is_approved` bedeutet damit wieder genau das, was es vor 013 bedeutet
--     hat: 1 = aktiv (Standard), 0 = von einem Admin gesperrt.
--
--  2. Profil
--     `photo_path` und `phone` machen aus dem Konto ein Profil: Das Bild steht
--     auf der Startseite und im Kader, die Telefonnummer ist freiwillig und
--     erscheint als Kontakt neben der E-Mail.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. Registrierung ohne Freigabe
-- ----------------------------------------------------------------------------
ALTER TABLE users
  MODIFY COLUMN is_approved TINYINT(1) NOT NULL DEFAULT 1
      COMMENT 'Konto aktiv (1) oder von einem Admin gesperrt (0). Standard 1 – es gibt KEINE Registrierungs-Freigabe. Wird bei Login, Session (/me) und RBAC geprüft, damit eine Sperre sofort greift.';

-- Konten, die zwischen 013 und 014 registriert wurden, warten sonst ewig.
UPDATE users SET is_approved = 1 WHERE is_approved = 0 AND approved_at IS NULL;

ALTER TABLE users DROP COLUMN approved_at;

-- ----------------------------------------------------------------------------
--  2. Profilbild und Telefonnummer
-- ----------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN photo_path VARCHAR(255) DEFAULT NULL
      COMMENT 'Relativer Pfad des Profilbildes in backend/uploads/, z. B. "users/ab12.jpg". Ausgeliefert über /api/uploads/<pfad>. NULL = Initialen anzeigen.'
      AFTER email;

ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) DEFAULT NULL
      COMMENT 'Freiwillige Telefonnummer. Wird neben der E-Mail als Kontakt angezeigt – bei Trainer:innen für alle, bei Spieler:innen nur für das Trainerteam.'
      AFTER photo_path;
