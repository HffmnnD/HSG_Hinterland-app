# Datenbank – HSG Hinterland App

MySQL/MariaDB, Datenbankname `hsg_hinterland`, Zeichensatz `utf8mb4`.

## Dateien in diesem Ordner

| Datei | Zweck |
| ----- | ----- |
| `schema.sql` | **Referenz.** Vollständiges, kommentiertes Schema. Für eine frische DB in phpMyAdmin ausführen. Wird bei jeder Schemaänderung mitgepflegt. |
| `migrations/001_initial_schema.sql` | Eingefrorener Startzustand (inhaltsgleich mit `schema.sql`). |
| `migrations/0NN_*.sql` | Spätere Änderungen, fortlaufend nummeriert. |
| `migrate.js` | Runner: führt alle `migrations/*.sql` sortiert aus. `npm run migrate`. Alle Migrationen sind idempotent. |

## Tabellen auf einen Blick

```
┌─────────────┐        ┌────────────────┐        ┌──────────────┐
│    users    │───1:n──│   user_teams   │──n:1───│    teams     │
│             │        │  relation_type │        │              │
│ id (PK)     │        │  player|coach  │        │ id (PK)      │
│ email (uq)  │        │  |fan          │        │ code (uq)    │
│ role        │        └────────────────┘        │ name         │
│ is_approved │                                  └──────────────┘
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
| `is_approved` | `0` = wartet auf Admin-Freigabe (Login gesperrt), `1` = aktiv |
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
| `coach` | trainiert sie – darf ihren Kader auf `/teams/:code` verwalten |
| `fan` | interessiert sich für sie |

`ON DELETE CASCADE`: Wird ein Mitglied oder ein Team gelöscht, verschwinden
die Zeilen hier automatisch.

### `user_services` – Helferdienste

Verbindungstabelle `users ↔ Dienst`. Primärschlüssel `(user_id, service_type)`.
`service_type` ∈ { `zeitnehmer`, `verkaufsdienst` }. `ON DELETE CASCADE`.

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
