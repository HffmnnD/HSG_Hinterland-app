-- Migration: Rolle `sub_admin` (Orga-Admin / Vorstand).
-- MODIFY COLUMN ist idempotent – ein erneuter Lauf ändert nichts.

USE hsg_hinterland;

ALTER TABLE users
  MODIFY COLUMN role
  ENUM('admin', 'sub_admin', 'trainer', 'spieler', 'zuschauer')
  NOT NULL DEFAULT 'spieler';
