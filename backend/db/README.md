# Datenbank – HSG Hinterland App

MySQL/MariaDB, Datenbankname `hsg_hinterland`, Zeichensatz `utf8mb4`.

## Dateien in diesem Ordner

| Datei | Zweck |
| ----- | ----- |
| `schema.sql` | **Referenz.** Vollständiges, kommentiertes Schema, laufend gepflegt (= Stand aller Migrationen). Für eine frische DB in phpMyAdmin ausführen. |
| `migrations/001_initial_schema.sql` | Eingefrorener Startzustand. |
| `migrations/002_team_confirmation.sql` | `is_confirmed` ergänzt, globale Admin-Freigabe abgeschafft. |
| `migrations/004_news_table.sql` | Tabelle `news` für Vereins-Ankündigungen. |
| `migrations/005_team_page.sql` | Mannschaftsseite: Ligaverknüpfung, Foto, Sponsoren, Kaderangaben. |
| `migrations/006_admin_console.sql` | News-Archiv (`is_archived`) und Mannschafts-Stammdaten (`age_group`, `gender`, `sort_order`). |
| `migrations/007_news_second_image.sql` | Zweites Beitragsbild (`image_path_2`). |
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
| `age_group` | Altersklasse / Jugend als freier Text, z. B. „C-Jugend" oder „Erwachsene". Bewusst kein ENUM: die Verbände benennen Altersklassen regelmäßig um |
| `gender` | `male` / `female` / `mixed`, `NULL` = nicht angegeben |
| `sort_order` | Anzeigereihenfolge im ganzen Frontend, kleinste Zahl zuerst; bei Gleichstand entscheidet der Name. **Interner Sortierschlüssel** – vom Server vergeben (`nextSortOrder`), kein Eingabefeld und nicht Teil der API-Antwort |
| `handball_team_id` | nuLiga-Nummer (`teamtable`) für Tabelle/Spielplan/Ticker. `NULL` = keine Ligaanbindung |
| `photo_path` | Mannschaftsfoto in `backend/uploads/`, z. B. `teams/ab12.jpg` |

Seed: `MJC`, `MJB`, `MJA`, `H1` (1. Herren), `H2` (2. Herren), `D1` (Damen) –
mit `sort_order` in Zehnerschritten (10, 20, …), damit sich eine neue
Mannschaft ohne Umnummerieren dazwischen schieben lässt.

Neue Mannschaften legt die Verwaltung über `POST /api/admin/teams` an, der
Controller hängt sie hinten an. Name, Altersklasse, Geschlecht und
nuLiga-Nummer lassen sich danach über `PATCH /api/teams/:code` ändern – `code`
bewusst nicht, es steht in Links und Lesezeichen.

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
| `image_path` | Relativer Pfad des ersten Bilds in `backend/uploads/`, z. B. `news/ab12cd34.jpg`. `NULL` = ohne Bild |
| `image_path_2` | Zweites Bild, gleiches Format. `NULL` = kein zweites. Höchstens zwei Bilder je Beitrag; die Plätze werden der Reihe nach gefüllt |
| `is_archived` | `0` = aktiv (im Feed), `1` = archiviert. Archivierte Beiträge verschwinden aus dem Dashboard, bleiben in der Verwaltung erhalten und lassen sich zurückholen |
| `author_id` | FK → `users.id`, `ON DELETE SET NULL` (Beitrag überlebt das Löschen des Kontos) |
| `created_at` / `updated_at` | Veröffentlichung / letzte Änderung |

Rechte: Lesen alle angemeldeten Mitglieder, Anlegen, Archivieren und Löschen
nur `admin` und `sub_admin` (Trainer:innen **nicht**).

**Archivieren statt löschen:** Der Regelweg der Oberfläche setzt
`is_archived = 1`. Der Feed (`GET /api/news`) liest nur `is_archived = 0` –
dafür gibt es den zusammengesetzten Index `idx_news_archived_created`, der
Filter und Sortierung in einem Zugriff bedient. Endgültiges Löschen bleibt
möglich (nur so wird auch die Bilddatei frei), ist in der Oberfläche aber auf
das Archiv beschränkt und fragt nach.

> Bilder liegen **nicht** in der Datenbank. `backend/config/uploads.js`
> speichert sie unter zufälligem Namen im Dateisystem; beim Löschen eines
> Beitrags räumt der Controller die Datei mit weg.

### `schema_migrations` – Migrationsverlauf

Eine Zeile pro angewendeter Migrationsdatei (`filename`, `applied_at`). Vom
Runner `migrate.js` gepflegt; verhindert, dass einmalige Daten-Backfills bei
einem zweiten Lauf erneut greifen.

## Wo im Code wird zugegriffen?

Kein Controller enthält rohes SQL. Alle Abfragen liegen in
`backend/repositories/`:

| Repository | Zuständig für |
| ---------- | ------------- |
| `userRepository.js` | `users` + zusammengesetztes Profil (`getFullProfile`, `listAllWithProfiles`, seitenweise `listPageWithProfiles`, `getMemberStats`), Transaktionen für Registrierung und Admin-Änderungen |
| `teamRepository.js` | `teams` + `user_teams` (Kader, Kandidaten, Zuordnungen) |
| `serviceRepository.js` | `user_services` |
| `newsRepository.js` | `news` (Feed, Anlegen, Archivieren, Löschen) |

Eingabe-Prüfung (Typen, erlaubte Werte, Existenz von Team-IDs) liegt in
`backend/utils/validation.js`, die erlaubten Enum-Werte in
`backend/utils/roles.js`.
