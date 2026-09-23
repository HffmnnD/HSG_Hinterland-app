-- ============================================================================
--  Migration 012 – alte nuLiga-Schlüssel aufräumen
-- ----------------------------------------------------------------------------
--  Migration 010 hat Ligaspiele anhand der nuLiga-SPIEL-ID übernommen. Das war
--  falsch: Diese ID entsteht erst, wenn zu einer Begegnung ein Spielbericht
--  existiert. Vor der Saison ist sie für praktisch jedes Spiel leer – der
--  Abgleich verwarf genau diese Spiele und übernahm nur die bereits
--  gespielten. Im Kalender stand deshalb scheinbar nichts.
--
--  Seit dem Fix ist der Schlüssel die SPIELNUMMER plus Saison ("nr:14@2026").
--  Die ist von Anfang an vergeben und ändert sich nicht, wenn später ein
--  Spielbericht dazukommt.
--
--  Wo der alte Abgleich schon gelaufen ist, liegen die betroffenen Spiele nun
--  DOPPELT vor: einmal unter der alten ID, einmal unter der neuen Nummer.
--  Diese Migration entfernt die Altlasten.
--
--  Datenverlust: Rückmeldungen, die an einer alten Zeile hingen, gehen mit
--  verloren (ON DELETE CASCADE). Das ist vertretbar – betroffen sind nur
--  bereits gespielte Begegnungen aus den wenigen Tagen, in denen die kaputte
--  Fassung lief, und dieselbe Begegnung steht korrekt verschlüsselt daneben.
--
--  Von Hand angelegte Termine (`nuliga_game_id IS NULL`) bleiben unberührt.
--
--  Wird von `npm run migrate` genau einmal ausgeführt (schema_migrations).
-- ============================================================================

USE hsg_hinterland;

DELETE FROM events
 WHERE nuliga_game_id IS NOT NULL
   AND nuliga_game_id NOT LIKE 'nr:%';
