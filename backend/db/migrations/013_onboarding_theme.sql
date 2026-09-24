-- ============================================================================
--  Migration 013 – Schlanke Registrierung, Onboarding und Design-Vorliebe
-- ----------------------------------------------------------------------------
--  Drei zusammenhängende Änderungen:
--
--  1. Registrierung
--     Das Formular fragt nur noch Vorname, Nachname, E-Mail und Passwort ab.
--     Neue Konten entstehen mit `is_approved = 0` und warten auf die Freigabe
--     durch die Verwaltung. `approved_at` unterscheidet dabei die beiden
--     Fälle, die vorher beide „nicht freigegeben" hießen:
--        approved_at IS NULL      -> neu, wartet auf die erste Freigabe
--        approved_at IS NOT NULL  -> war freigegeben und wurde gesperrt
--
--  2. Onboarding
--     Beim ersten Login nach der Freigabe führt ein Assistent durch Rolle,
--     Mannschaften und Design. `onboarding_completed_at` merkt sich, dass das
--     erledigt ist. Bestandskonten bekommen den Zeitstempel hier gesetzt – sie
--     haben ihre Angaben bereits bei der Registrierung gemacht.
--
--  3. Design
--     `theme` speichert die Wahl dauerhaft im Profil, damit der Dunkelmodus
--     auf jedem Gerät derselbe ist.
--
--  Dazu der Bildausschnitt des Mannschaftsfotos: Verschiebung und Zoom des
--  Kopfbereichs werden als Werte gespeichert, das Originalbild bleibt
--  unangetastet und lässt sich jederzeit neu ausrichten.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  users
-- ----------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN theme ENUM('system','light','dark') NOT NULL DEFAULT 'system'
      COMMENT 'Design-Vorliebe: system = dem Gerät folgen | light | dark. Wird im Onboarding gesetzt und unter „Mein Konto" geändert.'
      AFTER role;

ALTER TABLE users
  ADD COLUMN onboarding_completed_at DATETIME DEFAULT NULL
      COMMENT 'Zeitpunkt, zu dem der Onboarding-Assistent abgeschlossen wurde (Ortszeit). NULL = steht beim nächsten Login an.'
      AFTER theme;

ALTER TABLE users
  ADD COLUMN approved_at DATETIME DEFAULT NULL
      COMMENT 'Zeitpunkt der ERSTEN Freigabe durch die Verwaltung (Ortszeit). NULL zusammen mit is_approved = 0 heißt „wartet auf Freigabe", gesetzt heißt „wurde gesperrt".'
      AFTER is_approved;

-- Neue Registrierungen warten ab jetzt auf die Freigabe.
ALTER TABLE users
  MODIFY COLUMN is_approved TINYINT(1) NOT NULL DEFAULT 0
      COMMENT 'Konto freigegeben (1) oder gesperrt/noch nicht freigegeben (0). Neue Registrierungen starten mit 0. Wird bei Login, Session (/me) und RBAC geprüft.';

-- Bestandsdaten: bereits aktive Konten gelten als freigegeben, alle
-- bestehenden Konten haben ihre Angaben schon bei der Registrierung gemacht.
UPDATE users SET approved_at = created_at WHERE is_approved = 1 AND approved_at IS NULL;
UPDATE users SET onboarding_completed_at = created_at WHERE onboarding_completed_at IS NULL;

-- ----------------------------------------------------------------------------
--  teams – Bildausschnitt des Mannschaftsfotos im Kopfbereich
-- ----------------------------------------------------------------------------
--  Gespeichert wird NICHT ein zugeschnittenes Bild, sondern wie das Original
--  im Banner liegt. Vorteile: das Original bleibt in voller Auflösung
--  erhalten, der Ausschnitt lässt sich jederzeit korrigieren, und ein
--  anderes Seitenverhältnis (Handy/Desktop) schneidet nicht plötzlich Köpfe ab.
ALTER TABLE teams
  ADD COLUMN photo_focus_x TINYINT UNSIGNED NOT NULL DEFAULT 50
      COMMENT 'Waagerechter Bildmittelpunkt im Banner in Prozent (0 = ganz links, 100 = ganz rechts). Entspricht object-position.'
      AFTER photo_path;

ALTER TABLE teams
  ADD COLUMN photo_focus_y TINYINT UNSIGNED NOT NULL DEFAULT 50
      COMMENT 'Senkrechter Bildmittelpunkt im Banner in Prozent (0 = Oberkante, 100 = Unterkante). Damit rutschen Köpfe ins Bild.'
      AFTER photo_focus_x;

ALTER TABLE teams
  ADD COLUMN photo_zoom SMALLINT UNSIGNED NOT NULL DEFAULT 100
      COMMENT 'Vergrößerung des Fotos im Banner in Prozent (100 = einpassen, 300 = dreifach). Ganzzahl statt Kommazahl – reicht für einen Schieberegler und rechnet exakt.'
      AFTER photo_focus_y;
