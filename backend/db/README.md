# Datenbank – HSG Hinterland App

MySQL/MariaDB, Datenbankname `hsg_hinterland`, Zeichensatz `utf8mb4`.

## Dateien in diesem Ordner

| Datei | Zweck |
| ----- | ----- |
| `schema.sql` | **Referenz.** Vollständiges, kommentiertes Schema, laufend gepflegt (= Stand aller Migrationen). Für eine frische DB in phpMyAdmin ausführen. |
| `migrations/001_initial_schema.sql` | Eingefrorener Startzustand. |
| `migrations/002_team_confirmation.sql` | `is_confirmed` ergänzt, globale Admin-Freigabe abgeschafft. |
| `migrations/004_news_table.sql` | Tabelle `news` für Vereins-Ankündigungen. |
| `migrations/005_team_page.sql` | Mannschaftsseite: nuLiga-Nummer, Foto, Sponsoren, Kaderangaben. |
| `migrations/009_schedule_module.sql` | Termin-Modul: `event_series`, `events`, `attendances`, `long_term_absences`. |
| `migrations/0NN_*.sql` | Weitere Änderungen, fortlaufend nummeriert. |
| `migrate.js` | Runner (`npm run migrate`): führt jede Datei **genau einmal** aus und merkt sich das in `schema_migrations`. So dürfen Migrationen einmalige Daten-Backfills enthalten. |

## Tabellen auf einen Blick

```
┌─────────────┐        ┌────────────────┐        ┌──────────────┐
│    users    │───1:n──│   user_teams   │──n:1───│    teams     │
│             │        │  relation_type │        │              │
│ id (PK)     │        │  player|coach  │        │ id (PK)      │
│ email (uq)  │        │  |fan          │        │ code (uq)    │
│ role        │        │  is_confirmed  │        │ name         │
│ is_approved │        └────────────────┘        └──────────────┘
│ ...         │───1:n──┐
└─────────────┘        │   ┌────────────────┐
      │                └───│  user_services │
      │                    │  service_type  │
      │                    │  zeitnehmer|   │
      │                    │  verkaufsdienst│
      │                    └────────────────┘
      │                    ┌────────────────┐
      ├──────1:n───────────│  attendances   │──n:1──> events <──n:1── teams
      │                    │  status        │   ▲
      │                    │  reason        │   │ series_id
      │                    └────────────────┘   └── event_series
      │                    ┌──────────────────────┐
      ├──────1:n───────────│  long_term_absences  │──n:1──> teams (optional)
      │                    │  VACATION|INJURY|…   │
      │                    └──────────────────────┘
      │                    ┌────────────────┐
      └──────1:n───────────│      news      │
       (author_id,         │  title         │
        ON DELETE          │  content       │
        SET NULL)          │  image_path    │
                           └────────────────┘
```

### `users` – Mitglieder & Login-Konten

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel, überall als `user_id` referenziert |
| `first_name`, `last_name` | Name |
| `email` | Login-Name, **eindeutig**, klein/getrimmt gespeichert |
| `password_hash` | bcrypt-Hash – nie im Klartext, nie an den Client |
| `is_approved` | `1` = aktiv (Standard), `0` = von einem Admin gesperrt. **Keine** globale Registrierungs-Freigabe mehr. Wird bei Login, `/api/auth/me` und in `checkRole` geprüft, damit eine Sperre sofort wirkt |
| `role` | RBAC-Rolle, siehe unten. Wird **nicht** bei der Registrierung gesetzt |
| `created_at` | Registrierungszeitpunkt |

**Rollen** (`role`):

| Rolle | Darf |
| ----- | ---- |
| `admin` | alles |
| `sub_admin` | wie `admin`, **aber**: keine `admin`-Konten bearbeiten, keine `admin`-Rolle vergeben |
| `trainer` | Mitgliederliste sehen, Spieler-Mannschaften zuweisen |
| `spieler` | nur lesen |
| `zuschauer` | nur lesen |

### `teams` – Mannschaften

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel (`team_id`) |
| `name` | ausgeschrieben, z. B. „Männliche Jugend C" |
| `code` | Kürzel für URL/Chips, z. B. `MJC`, **eindeutig**, immer GROSS |

Seed: `MJC`, `MJB`, `MJA`, `H1` (1. Herren), `H2` (2. Herren), `D1` (Damen).

### `user_teams` – wer gehört wie zu welcher Mannschaft

Verbindungstabelle `users ↔ teams`. Der **Primärschlüssel ist
`(user_id, team_id, relation_type)`** – dieselbe Person kann pro Mannschaft
mehrere Beziehungen haben (z. B. Trainer der MJC *und* Spieler der H1).

| `relation_type` | Bedeutung |
| --------------- | --------- |
| `player` | spielt in der Mannschaft |
| `coach` | trainiert sie – darf ihren Kader auf `/teams/:code` verwalten (nur wenn `is_confirmed = 1`) |
| `fan` | interessiert sich für sie |

**`is_confirmed`** – Beitrittsprozess statt globaler Freigabe:

| Wert | Bedeutung |
| ---- | --------- |
| `0` | offene Beitrittsanfrage. Nur die Verwaltung sieht sie (`pendingMembers`), nicht der öffentliche Kader. |
| `1` | vom Trainer bestätigt (oder direkt so angelegt). Teil des Kaders. |

Bei der Registrierung: `player`/`coach` → `0`, `fan` → `1`. Alles, was
Trainer/Admin manuell anlegen (`addMember`, `callup`, Admin-`teamIds`), ist
sofort `1`.

`ON DELETE CASCADE`: Wird ein Mitglied oder ein Team gelöscht, verschwinden
die Zeilen hier automatisch.

### `user_services` – Helferdienste

Verbindungstabelle `users ↔ Dienst`. Primärschlüssel `(user_id, service_type)`.
`service_type` ∈ { `zeitnehmer`, `verkaufsdienst` }. `ON DELETE CASCADE`.

### `news` – Vereins-News & Ankündigungen

Das „Schwarze Brett" des Vereins. Beiträge erscheinen im Dashboard aller
angemeldeten Mitglieder, absteigend nach `created_at`.

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel |
| `title` | Überschrift (max. 150 Zeichen) |
| `content` | Fließtext (max. 5000 Zeichen, per Validierung). **Reiner Text** – das Frontend rendert ihn nie als HTML |
| `image_path` | Relativer Pfad des Bilds in `backend/uploads/`, z. B. `news/ab12cd34.jpg`. `NULL` = ohne Bild |
| `author_id` | FK → `users.id`, `ON DELETE SET NULL` (Beitrag überlebt das Löschen des Kontos) |
| `created_at` / `updated_at` | Veröffentlichung / letzte Änderung |

Rechte: Lesen alle angemeldeten Mitglieder, Anlegen und Löschen nur `admin`
und `sub_admin` (Trainer:innen **nicht**).

> Bilder liegen **nicht** in der Datenbank. `backend/config/uploads.js`
> speichert sie unter zufälligem Namen im Dateisystem; beim Löschen eines
> Beitrags räumt der Controller die Datei mit weg.

### `event_series` – Regel einer wiederkehrenden Trainingsserie

Die Vorlage für „jeden Dienstag und Donnerstag, 19:00–20:30 Uhr, Halle West".

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel, von `events.series_id` referenziert |
| `team_id` | FK → `teams.id`, `ON DELETE CASCADE` |
| `title`, `type`, `location` | werden auf jeden erzeugten Termin übernommen |
| `weekdays` | Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64 → „Di + Do" = 10 |
| `start_time` / `end_time` | Uhrzeit (TIME). Ende vor Beginn = über Mitternacht |
| `starts_on` / `ends_on` | Zeitraum der Serie, beide Tage einschließlich |
| `reasons_visible_to_all` | Voreinstellung für die erzeugten Termine |
| `created_by` | FK → `users.id`, `ON DELETE SET NULL` |

> **Warum die Serie materialisiert wird:** Beim Anlegen entsteht für jede
> Einheit eine eigene Zeile in `events`. An einem Termin hängen
> Rückmeldungen, und die Historie muss Jahre später noch beantworten können
> „war Person X am 01.01.2026 beim Training?". Eine nachträglich geänderte
> Regel würde die Vergangenheit umschreiben.

### `events` – ein konkreter Termin

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel (`event_id`) |
| `team_id` | FK → `teams.id`. Bestimmt, wer den Termin sieht |
| `series_id` | FK → `event_series.id` oder `NULL` (Einzeltermin). `ON DELETE SET NULL`, damit vergangene Einheiten das Beenden der Serie überleben |
| `title` | z. B. „Training" oder „Handballcamp" |
| `type` | `REGULAR_TRAINING` \| `SINGLE_TRAINING` \| `EVENT_CAMP` \| `MATCH` |
| `location` | Halle / Treffpunkt, `NULL` = noch offen |
| `start_time` / `end_time` | **DATETIME in Ortszeit**, nicht TIMESTAMP: 19:00 Uhr bleibt 19:00 Uhr, egal in welcher Zeitzone der Server läuft. Mehrtägige Termine (Camp) enden an einem späteren Datum |
| `reasons_visible_to_all` | `0` (Standard) = nur das Trainerteam sieht die Abmeldegründe, alle anderen nur **wer** fehlt. `1` = alle sehen auch **warum** |

### `attendances` – Zu- und Absagen zu einem Termin

**Fehlt die Zeile, gilt die Person als zugesagt.** Das ist die zentrale Regel
des Moduls: Im Training ist Dabeisein der Normalfall, melden muss sich nur,
wer nicht kommt. Deshalb bleibt die Tabelle auch nach Jahren klein.

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel |
| `event_id` / `user_id` | FK → `events.id` / `users.id`, beide `ON DELETE CASCADE`. Zusammen **UNIQUE** – höchstens eine Rückmeldung je Person und Termin |
| `status` | `ATTENDING` \| `DECLINED` |
| `reason` | Grund der Abmeldung (max. 200 Zeichen). **Pflicht bei `DECLINED`**, bei `ATTENDING` immer `NULL` |
| `set_by_user_id` | Wer zuletzt gespeichert hat. Weicht er von `user_id` ab, hat das Trainerteam übersteuert |
| `updated_at` | Letzte Änderung – entscheidet gegen `long_term_absences.created_at`, welche Angabe die jüngere ist |

### `long_term_absences` – Urlaub, Verletzung, sonstige Abwesenheit

Deckt der Zeitraum einen Termin ab, gilt die Person dort automatisch als
abgesagt – **ohne** Zeile in `attendances`. Eine nachträglich verlängerte
Verletzung wirkt damit sofort auf alle betroffenen Termine.

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel |
| `user_id` | FK → `users.id`, `ON DELETE CASCADE` |
| `team_id` | FK → `teams.id` oder `NULL` = gilt für **alle** Mannschaften der Person (Normalfall bei Urlaub und Verletzung) |
| `type` | `VACATION` \| `INJURY` \| `OTHER` |
| `start_date` / `end_date` | Zeitraum, beide Tage einschließlich |
| `note` | Freitext, wird als Abmeldegrund angezeigt. `NULL` → die Bezeichnung des Typs („Urlaub") |
| `created_at` | Anlagezeitpunkt – siehe Vorrangregel unten |

**Welche Angabe gilt?** (`backend/services/attendanceService.js`)

1. Keine Rückmeldung, keine Abwesenheit → **zugesagt**.
2. Abwesenheit überschneidet den Termin → **abgesagt** mit deren Grund.
3. Widersprechen sich beide, gewinnt die **jüngere** Angabe
   (`attendances.updated_at` gegen `long_term_absences.created_at`). Wer erst
   zusagt und danach Urlaub einträgt, ist im Urlaub. Wer im eingetragenen
   Urlaub für ein einzelnes Training ausdrücklich zusagt („bin früher
   zurück"), ist an diesem Termin dabei.

### `schema_migrations` – Migrationsverlauf

Eine Zeile pro angewendeter Migrationsdatei (`filename`, `applied_at`). Vom
Runner `migrate.js` gepflegt; verhindert, dass einmalige Daten-Backfills bei
einem zweiten Lauf erneut greifen.

## Wo im Code wird zugegriffen?

Kein Controller enthält rohes SQL. Alle Abfragen liegen in
`backend/repositories/`:

| Repository | Zuständig für |
| ---------- | ------------- |
| `userRepository.js` | `users` + zusammengesetztes Profil (`getFullProfile`, `listAllWithProfiles`), Transaktionen für Registrierung und Admin-Änderungen |
| `teamRepository.js` | `teams` + `user_teams` (Kader, Kandidaten, Zuordnungen) |
| `serviceRepository.js` | `user_services` |
| `newsRepository.js` | `news` (Feed, Anlegen, Löschen) |
| `eventRepository.js` | `events` + `event_series` (Terminliste, Serien anlegen/ändern/beenden) |
| `attendanceRepository.js` | `attendances` + `long_term_absences` |

Eingabe-Prüfung (Typen, erlaubte Werte, Existenz von Team-IDs) liegt in
`backend/utils/validation.js`, die erlaubten Enum-Werte in
`backend/utils/roles.js`.
