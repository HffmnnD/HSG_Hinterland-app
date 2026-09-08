-- ============================================================================
--  Migration 003 – Bestandskonten aktivieren
-- ----------------------------------------------------------------------------
--  Migration 002 hat den Spalten-Default auf 1 gesetzt, aber die Anwendung
--  hat bis zu diesem Fix bei der Registrierung weiterhin `is_approved = 0`
--  geschrieben. Diese Konten hier einmalig aktivieren.
--
--  `is_approved` ist ab jetzt ausschliesslich eine Admin-Sperre:
--    1 = aktiv (Standard), 0 = von einem Admin gesperrt.
--  Der Login-, Session- und RBAC-Check prüfen das Flag wieder – NICHT als
--  Registrierungs-Freigabe, sondern damit eine Sperre sofort greift.
-- ============================================================================

USE hsg_hinterland;

UPDATE users SET is_approved = 1 WHERE is_approved = 0;
