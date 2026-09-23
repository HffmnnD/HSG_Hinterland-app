-- ============================================================================
--  Migration 011 – Termine absagen
-- ----------------------------------------------------------------------------
--  Ein Training fällt aus: Halle belegt, Trainer krank, Wetter. Bisher blieb
--  dem Trainerteam nur das Löschen – damit verschwand der Termin samt aller
--  Rückmeldungen spurlos, und wer nicht in der App nachsah, stand vor der
--  Halle.
--
--  Eine Absage ist etwas anderes als ein Löschen:
--    - Der Termin BLEIBT sichtbar, deutlich als abgesagt gekennzeichnet.
--    - Er zählt NICHT mehr in die Trainingsbeteiligung. Niemand soll eine
--      schlechtere Quote bekommen, weil der Verein abgesagt hat.
--    - Die Rückmeldungen bleiben erhalten (falls die Absage zurückgenommen
--      wird).
--
--  Das endgültige Löschen gibt es weiterhin – für Termine, die versehentlich
--  angelegt wurden und in keiner Statistik auftauchen sollen.
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;


ALTER TABLE events
  ADD COLUMN cancelled_at DATETIME DEFAULT NULL
    COMMENT 'Zeitpunkt der Absage (Ortszeit). NULL = findet statt. Gesetzt = der Termin bleibt sichtbar, wird aber als abgesagt gekennzeichnet und in keiner Beteiligungsquote mitgezählt.'
    AFTER reasons_visible_to_all;

ALTER TABLE events
  ADD COLUMN cancel_reason VARCHAR(200) DEFAULT NULL
    COMMENT 'Kurzer Grund der Absage, z. B. "Halle belegt". Wird allen Mitgliedern der Mannschaft angezeigt – anders als ein persönlicher Abmeldegrund gibt es hier nichts zu schützen.'
    AFTER cancelled_at;
