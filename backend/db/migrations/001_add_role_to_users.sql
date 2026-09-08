-- Migration: Rollen-Feld für RBAC ergänzen.
-- In phpMyAdmin auf der Datenbank `hsg_hinterland` ausführen.

USE hsg_hinterland;

ALTER TABLE users
  ADD COLUMN role ENUM('admin', 'trainer', 'spieler', 'zuschauer')
  NOT NULL DEFAULT 'spieler'
  AFTER is_approved;

-- Optional: ersten Admin festlegen
-- UPDATE users SET role = 'admin' WHERE email = 'admin@hsg-hinterland.de';
