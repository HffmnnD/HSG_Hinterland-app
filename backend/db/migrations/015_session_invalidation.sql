-- ============================================================================
--  Migration 015 – Passwortwechsel beendet alte Sitzungen
-- ----------------------------------------------------------------------------
--  Bis hierher galt ein ausgestelltes JWT bis zu seinem Ablauf (JWT_EXPIRES_IN,
--  Standard 7 Tage) – auch nach einem Passwortwechsel. Wer sein Passwort
--  ändert, weil jemand anderes es kennen könnte, erwartet aber genau das
--  Gegenteil: dass alle anderen Sitzungen sofort enden.
--
--  `sessions_valid_from` ist die Grenze dafür: Tokens, die VOR diesem Zeitpunkt
--  ausgestellt wurden, gelten nicht mehr. Verglichen wird mit dem `iat` des
--  Tokens, das ebenfalls in Unix-Sekunden zählt.
--
--  Bewusst eine Zahl und kein DATETIME: `iat` ist UTC, eine DATETIME-Spalte
--  speichert Ortszeit. Ein Vergleich über diese Grenze hinweg wäre je nach
--  Zeitzone des Servers stundenweise falsch – und damit entweder wirkungslos
--  oder er würde alle Anmeldungen aussperren.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN sessions_valid_from INT UNSIGNED NOT NULL DEFAULT 0
      COMMENT 'Unix-Zeit (Sekunden), ab der ausgestellte Tokens gelten. Wird beim Passwortwechsel auf JETZT gesetzt und beendet damit alle anderen Sitzungen. 0 = nie gesetzt, alle Tokens gelten.'
      AFTER password_hash;

-- ----------------------------------------------------------------------------
--  Nachtrag zu 014: Der Kommentar an `phone` versprach zu viel.
--
--  Kontaktdaten der Trainer:innen sind NICHT „für alle" sichtbar, sondern nur
--  für die Mitglieder der jeweiligen Mannschaft (siehe teamRepository.mapMember).
--  Die Registrierung steht offen und bestätigt keine E-Mail-Adresse – ein
--  frisches Konto ist deshalb keine Vertrauensstufe. Nur der Kommentar ändert
--  sich, die Spalte bleibt wie sie ist.
-- ----------------------------------------------------------------------------

ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(30) DEFAULT NULL
      COMMENT 'Freiwillige Telefonnummer aus den Kontoeinstellungen. Kontakt neben der E-Mail: bei Trainer:innen sichtbar für die Mitglieder ihrer Mannschaft, bei Spieler:innen nur für das Trainerteam.';
