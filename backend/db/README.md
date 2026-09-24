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
| `migrations/008_news_images_table.sql` | Bilder in die Tabelle `news_images` überführt – beliebig viele je Beitrag. |
| `migrations/005_team_page.sql` | Mannschaftsseite: nuLiga-Nummer, Foto, Sponsoren, Kaderangaben. |
| `migrations/012_nuliga_key_cleanup.sql` | Entfernt Spiele, die der erste (fehlerhafte) nuLiga-Abgleich unter der Spiel-ID angelegt hat. |
| `migrations/011_event_cancellation.sql` | `events.cancelled_at` / `cancel_reason`: Termine absagen statt löschen. |
| `migrations/010_nuliga_games.sql` | Ligaspiele aus nuLiga als Termine (`events.nuliga_game_id`, Schalter je Mannschaft). |
| `migrations/009_schedule_module.sql` | Termin-Modul: `event_series`, `events`, `attendances`, `long_term_absences`. |
| `migrations/013_onboarding_theme.sql` | Schlanke Registrierung: neue Konten warten auf die Freigabe (`is_approved` Default `0`, `approved_at`), Onboarding (`onboarding_completed_at`), Design (`theme`) und der Bildausschnitt des Mannschaftsfotos (`photo_focus_x/y`, `photo_zoom`). |
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
│ is_approved │        └────────────────┘        │ photo_*      │
│ approved_at │                                  └──────────────┘
│ theme       │
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
| `is_approved` | `1` = freigegeben, `0` = gesperrt **oder noch nicht freigegeben** (Standard). Wird bei Login, `/api/auth/me` und in `checkRole` geprüft, damit eine Sperre sofort wirkt |
| `approved_at` | Zeitpunkt der **ersten** Freigabe. Zusammen mit `is_approved = 0` unterscheidbar: `NULL` = wartet auf Freigabe (neue Registrierung), gesetzt = wurde gesperrt. Eine spätere Sperre lässt den Wert stehen |
| `role` | RBAC-Rolle, siehe unten. Wird **nicht** bei der Registrierung gesetzt (sondern im Onboarding bzw. von der Verwaltung) |
| `theme` | Design-Vorliebe: `system` (Standard, folgt dem Gerät), `light`, `dark`. Am Konto und nicht im Browser, damit das Design auf allen Geräten gleich ist |
| `onboarding_completed_at` | Wann der Einrichtungs-Assistent abgeschlossen wurde. `NULL` = steht beim nächsten Login an |
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
| `photo_focus_x`, `photo_focus_y` | Bildmittelpunkt im Kopfbereich in Prozent (0–100). Damit rutschen Köpfe ins Bild, statt am Rand abgeschnitten zu werden |
| `photo_zoom` | Vergrößerung im Kopfbereich in Prozent (100 = einpassen, max. 300). Gespeichert werden **Werte, kein zugeschnittenes Bild**: Das Original bleibt erhalten, und der Ausschnitt stimmt auf jedem Bildschirmformat |

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

Selbst gewählt (Onboarding, „Mein Konto"): `player`/`coach` → `0`, `fan` → `1`.
Alles, was Trainer/Admin manuell anlegen (`addMember`, `callup`,
Admin-`teamIds`), ist sofort `1`.

Die `fan`-Beziehung ist reine Anzeigesteuerung („wessen Spiele will ich
sehen?") und wird deshalb nirgends gezählt – weder in den `counts` einer
Mannschaft noch in der Verwaltung.

Ändert jemand seine Wahl unter „Mein Konto", gleicht
`teamRepository.replaceSelfRelations` die Zeilen ab, statt sie neu anzulegen:
Bestätigungen bleiben bestätigt, und Rückennummer, Position und die
Bezeichnung im Betreuerstab (dieselbe Zeile) gehen nicht verloren.

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
| (Bilder) | stehen seit Migration 008 in `news_images` – beliebig viele je Beitrag |
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
| `nuliga_game_id` | Herkunft aus nuLiga als `nr:<Spielnummer>@<Saison>`, `NULL` = von Hand angelegt. Zusammen mit `team_id` **UNIQUE**, damit ein erneuter Abgleich denselben Termin aktualisiert statt ihn zu verdoppeln |
| `cancelled_at` / `cancel_reason` | Gesetzt = der Termin fällt aus. Er bleibt sichtbar und deutlich gekennzeichnet, zählt aber in keiner Beteiligungsquote mehr mit. Die Rückmeldungen bleiben erhalten, damit sich die Absage zurücknehmen lässt |
| `start_time` / `end_time` | **DATETIME in Ortszeit**, nicht TIMESTAMP: 19:00 Uhr bleibt 19:00 Uhr, egal in welcher Zeitzone der Server läuft. Mehrtägige Termine (Camp) enden an einem späteren Datum |
| `reasons_visible_to_all` | `0` (Standard) = nur das Trainerteam sieht die Abmeldegründe, alle anderen nur **wer** fehlt. `1` = alle sehen auch **warum** |

> **Ligaspiele** werden als echte Zeilen hier abgelegt (`type = 'MATCH'`),
> nicht bloß eingeblendet. Nur so gilt für sie dasselbe wie für jedes
> Training: Abmelden, Kaderübersicht, getrennte Auswertung. Der Abgleich läuft
> in `backend/services/nuligaSyncService.js` und rührt von Hand angelegte
> Termine nie an.

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
| `userRepository.js` | `users` + zusammengesetztes Profil (`getFullProfile`, seitenweise `listPageWithProfiles`, `getMemberStats`), Kontoanlage, Onboarding/Design/Passwort des eigenen Kontos sowie die Transaktionen der Admin-Änderungen |
| `teamRepository.js` | `teams` + `user_teams` (Kader, Kandidaten, Zuordnungen) |
| `serviceRepository.js` | `user_services` |
| `newsRepository.js` | `news` (Feed, Anlegen, Archivieren, Löschen) |
| `newsRepository.js` | `news` (Feed, Anlegen, Löschen) |
| `eventRepository.js` | `events` + `event_series` (Terminliste, Serien anlegen/ändern/beenden) |
| `attendanceRepository.js` | `attendances` + `long_term_absences` |

Eingabe-Prüfung (Typen, erlaubte Werte, Existenz von Team-IDs) liegt in
`backend/utils/validation.js`, die erlaubten Enum-Werte in
`backend/utils/roles.js`.
