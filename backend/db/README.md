# Datenbank – HSG Hinterland App

MySQL/MariaDB, Datenbankname `hsg_hinterland`, Zeichensatz `utf8mb4`.

## Dateien in diesem Ordner

| Datei | Zweck |
| ----- | ----- |
| `schema.sql` | **Referenz.** Vollständiges, kommentiertes Schema, laufend gepflegt (= Stand aller Migrationen). Für eine frische DB in phpMyAdmin ausführen. |
| `migrations/001_initial_schema.sql` | Eingefrorener Startzustand. |
| `migrations/002_team_confirmation.sql` | `is_confirmed` ergänzt, globale Admin-Freigabe abgeschafft. |
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
                       └───│  user_services │
                           │  service_type  │
                           │  zeitnehmer|   │
                           │  verkaufsdienst│
                           └────────────────┘
```

### `users` – Mitglieder & Login-Konten

| Spalte | Bedeutung |
| ------ | --------- |
| `id` | Primärschlüssel, überall als `user_id` referenziert |
| `first_name`, `last_name` | Name |
| `email` | Login-Name, **eindeutig**, klein/getrimmt gespeichert |
| `password_hash` | bcrypt-Hash – nie im Klartext, nie an den Client |
| `is_approved` | `1` = aktiv (Standard), `0` = von einem Admin gesperrt. **Keine** globale Registrierungs-Freigabe mehr – wird beim Login/Session-Check nicht geprüft |
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

Eingabe-Prüfung (Typen, erlaubte Werte, Existenz von Team-IDs) liegt in
`backend/utils/validation.js`, die erlaubten Enum-Werte in
`backend/utils/roles.js`.
