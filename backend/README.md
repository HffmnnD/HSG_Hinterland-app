# Backend – HSG Hinterland App

Express-API mit MySQL (`mysql2`), Passwort-Hashing (`bcrypt`) und JWT-Auth
über einen HttpOnly-Cookie. Rollenbasierte Zugriffskontrolle (RBAC).

## Setup

1. XAMPP starten (Apache + MySQL).
2. `.env` anlegen: `cp .env.example .env` und Werte anpassen
   (v. a. `JWT_SECRET`).
3. Abhängigkeiten installieren: `npm install`
4. Datenbank aufsetzen: `npm run migrate`
   (führt `db/migrations/*.sql` aus, idempotent). Alternativ in phpMyAdmin
   die kommentierte Referenz `db/schema.sql` ausführen.
   Details: [db/README.md](db/README.md).
5. Server starten: `npm run dev` (nodemon) oder `npm start`

Server: <http://localhost:5000>

## Projektstruktur

```
backend/
  config/
    auth.js              JWT-/Cookie-Konfiguration
    db.js                MySQL Connection-Pool (Modul)
    uploads.js           multer-Konfiguration + Pfad-/Löschhelfer für Bilder
    handball.js          nuLiga: URLs, Cache-Zeiten, ID-Kodierung/-Prüfung

  routes/                nur URL -> Controller-Funktion + Middleware
    authRoutes.js
    adminRoutes.js       Mitglieder + News + Mannschaften + System-Status
                         (alles ausser der Mitgliederliste: admin/sub_admin)
    teamsRoutes.js
    newsRoutes.js        GET /api/news (alle angemeldeten Mitglieder)
    handballRoutes.js    Tabelle/Spielplan/Ticker (+ Rate-Limit)

  middleware/
    authMiddleware.js    authenticate (JWT-Cookie) + checkRole (RBAC)
    metricsMiddleware.js zählt jeden Request für den System-Status

  controllers/           HTTP + Geschäftsregeln, KEIN SQL
    authController.js    register / login / logout / me
    adminController.js    listUsers (seitenweise) / getUserStats / updateUser
                          (inkl. Sub-Admin-Sperren) / listTeams / createTeam
    teamsController.js    listTeams / getTeam / Stammdaten / Foto /
                          candidates / add / remove / callup / Kaderangaben
    newsController.js     listNews / listNewsForAdmin / createNews /
                          archiveNews / deleteNews (inkl. Bild-Aufräumen)
    handballController.js getTable / getSchedule / getTicker
    systemController.js   getSystemStatus / resetMetrics / clearHandballCache

  services/              Anbindung fremder Systeme (kein SQL, kein HTTP-Request/Response)
    handballClient.js    HTML-Abruf von nuLiga (axios + cheerio + Timeout)
    handballMapper.js    nuLiga-HTML -> stabile App-DTOs (Scraping)
    handballService.js   Cache, Anfrage-Bündelung, Notreserve
    metricsService.js    Requests/Antwortzeiten/Fehler/Herkunft (nur im RAM)
    systemService.js     CPU, RAM, Plattenplatz, Uptime (Node-Bordmittel)

  repositories/          gesamter Datenbankzugriff (alle SELECT/INSERT/JOINs)
    userRepository.js    users + zusammengesetztes Profil, Transaktionen
    teamRepository.js    teams + user_teams (Kader, Kandidaten, Zuordnungen)
    serviceRepository.js user_services
    newsRepository.js    news (Feed, Anlegen, Archivieren, Löschen)

  scripts/
    sweep-uploads.js     npm run uploads:sweep – verwaiste Bilder finden/löschen

  uploads/               hochgeladene Beitragsbilder (nicht im Git)
    news/

  utils/
    roles.js             erlaubte Enum-Werte (Rollen, Beziehungen, Dienste)
    geo.js               Herkunftsland aus Proxy-Headern (siehe System-Status)
    validation.js        Eingabe-Prüfung -> { ok, ... } | { ok:false, status, message }

  db/
    schema.sql           laufend gepflegte, kommentierte Referenz
    migrate.js            Runner: npm run migrate (einmalig je Datei, via schema_migrations)
    migrations/
      001_initial_schema.sql             eingefrorener Startzustand
      002_team_confirmation.sql          is_confirmed + Freigabe abgeschafft
      003_activate_existing_accounts.sql Bestandskonten aktivieren
      004_news_table.sql                 Tabelle news (Vereins-Ankündigungen)
      005_team_page.sql                  Mannschaftsseite: Ligaverknüpfung,
                                         Foto, Sponsoren, Kaderangaben
      006_admin_console.sql              News-Archiv (`is_archived`),
                                         Mannschafts-Stammdaten
                                         (Altersklasse, Geschlecht, Sortierung)
      007_news_second_image.sql          zweites Beitragsbild (image_path_2)
    README.md            Tabellen & Beziehungen auf einen Blick

  server.js
```

Der Datenfluss ist immer gleich:

```
Request → route → middleware → controller ──(validation.js)──> prüft Eingabe
                                     │
                                     └──(repositories/*)──────> spricht mit MySQL
                                     │
                                     ↓
                                  Response (JSON)
```

## Datenbank

Vollständig kommentiert in `db/schema.sql`, Kurzüberblick in
[db/README.md](db/README.md).

| Tabelle             | Zweck |
| ------------------- | ----- |
| `users`             | Konten inkl. `role` (ENUM). `is_approved` = Konto aktiv (Standard 1) bzw. vom Admin gesperrt (0) – bei Login/Session/RBAC geprüft |
| `teams`             | Mannschaften (`id`, `name`, `code`) – Seed: MJC, MJB, MJA, H1, H2, D1. Dazu `handball_team_id` (nuLiga) und `photo_path` (Mannschaftsfoto) |
| `team_sponsors`     | Sponsoren je Mannschaft für den Kopfbereich der Mannschaftsseite |
| `user_teams`        | n:m Nutzer ↔ Mannschaften mit `relation_type` ENUM(`player`,`coach`,`fan`) und `is_confirmed` (0 = offene Anfrage, 1 = vom Trainer bestätigt); PK `(user_id, team_id, relation_type)`. Kaderangaben je Mannschaft: `jersey_number`, `position`, `staff_title` |
| `user_services`     | Helferdienste, `service_type` ENUM(`zeitnehmer`,`verkaufsdienst`) |
| `schema_migrations` | vom Migrations-Runner gepflegt – welche Migration schon lief |

Alle Verknüpfungstabellen haben `ON DELETE CASCADE` auf `users`.

## Rollen (RBAC)

`users.role` ist ein ENUM: `admin`, `sub_admin`, `trainer`, `spieler`,
`zuschauer` (Standard `spieler`). Die Rolle wird bei Registrierung **nicht**
vom Client gesetzt, sondern nur von einem Admin/Sub-Admin über
`/api/admin/users/:id`.

| Rolle       | Darf |
| ----------- | ---- |
| `admin`     | alles |
| `sub_admin` | wie admin, **aber**: darf Admin-Konten nicht bearbeiten und die Rolle `admin` nicht vergeben (jeweils `403`) |
| `trainer`   | Mitgliederliste sehen, Spieler-Mannschaften zuweisen; `role`/`isApproved` gesperrt (`403`) |
| `spieler` / `zuschauer` | Mannschaftsseiten lesen |

Zusätzlich zur RBAC-Rolle gibt es **Beziehungen zur Mannschaft**
(`user_teams.relation_type`). Wer dort als `coach` einer Mannschaft eingetragen
ist, darf deren Kader verwalten – unabhängig von der RBAC-Rolle.

`checkRole(allowedRoles)` (in `middleware/authMiddleware.js`) wird nach
`authenticate` eingehängt, liest die Rolle frisch aus der DB (damit Entzug
sofort greift) und antwortet mit `403` inkl. `requiredRoles`, wenn die Rolle
nicht passt.

```js
router.get('/users', authenticate, checkRole('admin'), listUsers);
// oder mehrere: checkRole(['admin', 'trainer'])
```

## Registrierung, Sperre & Team-Bestätigung

**Keine globale Registrierungs-Freigabe.** Nach der Registrierung ist das Konto
sofort aktiv (`is_approved = 1` per Spalten-Default – die Anwendung setzt das
Feld beim INSERT nicht).

`is_approved = 0` heisst jetzt **von einem Admin gesperrt** und wird bei
**Login**, **`/api/auth/me`** und in **`checkRole`** geprüft – eine Sperre
greift also sofort (nicht erst nach Token-Ablauf). Die Meldung ist bewusst
„Dieses Konto wurde gesperrt." (nicht „wartet auf Freigabe").

Die **Zugehörigkeit zu einer Mannschaft** bestätigt der/die Trainer:in
(`user_teams.is_confirmed`):

- Registrierung mit `relationType` `player`/`coach` → `is_confirmed = 0`
  (offene Anfrage, taucht nur in `pendingMembers` auf)
- `relationType = 'fan'` sowie alles, was Trainer/Admin manuell anlegen
  (`addMember`, Admin-`teamIds`) → `is_confirmed = 1`
- `callup` legt eine **offene Anfrage** in der Zielmannschaft an (der/die
  dortige Trainer:in bestätigt)

**Automatische Rollen-Anhebung:** Wird eine `coach`-Beziehung bestätigt
(`/confirm` oder `addMember` mit `relationType=coach`), setzt das System die
globale `users.role` auf `trainer` – **nur** wenn sie vorher `spieler` oder
`zuschauer` war. `admin`/`sub_admin`/`trainer` bleiben unangetastet.

## Auth-Endpunkte

| Methode | Pfad                | Body                                      | Beschreibung |
| ------- | ------------------- | ---------------------------------------- | ------------ |
| POST    | `/api/auth/register`| `firstName, lastName, email, password, teams?, services?` | Konto sofort aktiv, `role = 'spieler'`. `teams: [{ teamId, relationType }]` und `services: […]` optional, transaktional. player/coach → offene Anfrage, fan → bestätigt. `teamIds: [1,2]` bleibt Kurzform (player). |
| POST    | `/api/auth/login`   | `email, password`                       | Setzt JWT (inkl. `role`) als HttpOnly-Cookie. Antwort enthält `user.role`, `user.teams` (mit `isConfirmed`) und `user.services`. |
| POST    | `/api/auth/logout`  | –                                       | Löscht den Cookie. |
| GET     | `/api/auth/me`      | – (Cookie)                              | Daten des angemeldeten Users inkl. `role`, `teams` (`[{ id, code, name, relationType, isConfirmed }]`) und `services`. |

## Mannschaften

| Methode | Pfad                                   | Auth | Beschreibung |
| ------- | -------------------------------------- | ---- | ------------ |
| GET     | `/api/teams`                           | –    | Alle Mannschaften. Öffentlich (Registrierungsformular). |
| GET     | `/api/teams/:code`                     | angemeldet | `team`, `members` (nur **bestätigte**, nach `player`/`coach`/`fan`), `counts`, `canManage`. Für Verwaltende zusätzlich `pendingMembers` (offene Anfragen, flache Liste mit `relationType`). E-Mails nur für Verwaltende. |
| GET     | `/api/teams/:code/candidates`          | Verwaltung | Aktive Mitglieder ohne diese Beziehung (`?relationType=`). |
| POST    | `/api/teams/:code/members`             | Verwaltung | `{ userId, relationType }` – Beziehung direkt **bestätigt** anlegen. Bei `relationType=coach` wird die globale Rolle ggf. auf `trainer` angehoben (`roleUpgraded` in der Antwort). |
| POST    | `/api/teams/:code/members/:userId/confirm` | Verwaltung | Offene Anfrage(n) bestätigen. `?relationType=` optional (sonst alle offenen). `404` wenn nichts offen. Antwort: `{ message, roleUpgraded }` – bei bestätigter `coach`-Anfrage wird die globale Rolle ggf. auf `trainer` angehoben. |
| DELETE  | `/api/teams/:code/members/:userId`     | Verwaltung | `?relationType=` – Beziehung entfernen / offene Anfrage ablehnen. |
| POST    | `/api/teams/:code/callup`              | Verwaltung | `{ userId, targetTeamCode }` – Spieler:in hochrufen. Legt eine **offene Anfrage** in der Zielmannschaft an (deren Trainer:in bestätigt). Voraussetzung: bestätigte:r Spieler:in der Quellmannschaft. |

„Verwaltung“ = `admin`, `sub_admin` oder als **bestätigte:r** `coach` dieser
Mannschaft eingetragen. Sonst `403`. Trainer:innen können sich nicht selbst als
Trainer:in der eigenen Mannschaft entfernen (sonst verlieren sie den Zugriff).

## Verwaltungs-Endpunkte (`checkRole(['admin', 'sub_admin', 'trainer'])`)

| Methode | Pfad                     | Body / Query                                          | Beschreibung |
| ------- | ------------------------ | ----------------------------------------------------- | ------------ |
| GET     | `/api/admin/users`       | `?search=&role=&status=&page=&pageSize=`              | **Seitenweise** Nutzerliste inkl. `teams` (mit `relationType`) und `services`. Antwort: `{ users, total, page, pageSize, pageCount }`. |
| GET     | `/api/admin/users/stats` | – (Cookie)                                            | Kennzahlen des **gesamten** Vereins: `{ total, active, inactive, recent, byRole }`. Bewusst getrennt von der Liste, damit die Zahlen im Kopf sich nicht mit den Filtern ändern. |
| PATCH   | `/api/admin/users/:id`   | `role?`, `isApproved?`, `teamIds?`, `services?`       | `teamIds` steuert die **Spieler**-Zuordnung (bestätigt; Trainer-/Fan-Beziehungen laufen über die Mannschaftsseite). `role` / `isApproved` (= Konto sperren/entsperren) nur `admin`+`sub_admin`. Alles transaktional. |

Sperren für `sub_admin` (jeweils `403`):

- Bearbeiten eines Kontos mit `role = 'admin'` – auch reine Team-Änderungen
- Setzen von `role = 'admin'` bei irgendeinem Konto

### Warum die Liste seitenweise kommt

Bis Migration 006 lieferte `GET /api/admin/users` **alle** Konten am Stück und
das Frontend filterte im Browser. Bei einem Verein mit vierstelliger
Mitgliederzahl sind das je Aufruf rund ein Megabyte JSON und tausend
Tabellenzeilen im DOM – jeder Tastendruck in der Suche hätte alles neu
durchgerechnet.

Gefiltert wird deshalb in SQL (`userRepository.listPageWithProfiles`):

- `search` trifft Vorname, Nachname, `"Vorname Nachname"`, E-Mail und die
  **Mitgliedsnummer** (= `users.id`, siehe unten),
- `role` genau eine Rolle, `status` = `active` / `inactive`,
- `pageSize` ist auf 100 gedeckelt (sonst wäre die Paginierung umgehbar),
- eine Seite ausserhalb des Bereichs liefert die **letzte** vorhandene, statt
  einer leeren Tabelle.

Die Relationen (Mannschaften, Dienste) werden mit zwei Sammelabfragen nur für
die IDs **dieser Seite** nachgeladen – kein N+1, unabhängig von der
Vereinsgröße.

> **Mitgliedsnummer** = `users.id`. Es gibt keine separate Spalte dafür: die
> ID ist eindeutig, ändert sich nie und steht dem Verein ohne zusätzliche
> Pflege zur Verfügung. Wird später eine echte Vereins-Mitgliedsnummer
> eingeführt, kommt sie als eigene Spalte dazu und wird in die `WHERE`-Klausel
> der Suche aufgenommen.

## Mannschaften anlegen (`admin` / `sub_admin`)

| Methode | Pfad | Body | Beschreibung |
| ------- | ---- | ---- | ------------ |
| GET | `/api/admin/teams` | – | Wie `/api/teams`, zusätzlich `counts` je Mannschaft (`player`, `coach`, `fan`, `pending`). |
| POST | `/api/admin/teams` | `name`, `code`, `ageGroup?`, `gender?`, `handballTeamId?` | Legt eine Mannschaft an. `409`, wenn das Kürzel vergeben ist. |
| PATCH | `/api/teams/:code` | `name?`, `ageGroup?`, `gender?`, `handballTeamId?` | Ändert die Stammdaten einer bestehenden Mannschaft (liegt bei den Team-Routen, nicht unter `/api/admin`). Leerstring löscht ein Feld. `code` ist **nicht** änderbar. |

- `code` wird auf Großbuchstaben normalisiert und muss `[A-Z0-9-]{2,20}`
  entsprechen – es steht in der URL (`/teams/:code`) und auf den Chips.
- `gender` ist das ENUM `male` / `female` / `mixed`, `ageGroup` freier Text
  (die Verbände benennen Altersklassen regelmäßig um).
- `sort_order` ist **kein Eingabefeld**. Die Anzeigereihenfolge vergibt der
  Server selbst (`nextSortOrder`, Zehnerschritte – so lässt sich später etwas
  dazwischen schieben); die Spalte bleibt ein interner Sortierschlüssel und
  taucht weder in einem Formular noch in einer API-Antwort auf. Ein `PATCH`
  mit `sortOrder` wird ignoriert bzw. als „keine Änderungen" abgelehnt.
- `handballTeamId` ist die nuLiga-Nummer (`teamtable`). Ist sie gesetzt,
  bedienen Tabelle, Spielplan und Live-Ticker der Mannschaftsseite sich
  **sofort** aus dem bestehenden nuLiga-Modul – es ist kein weiterer Schritt
  nötig.
- Auf die Eindeutigkeit prüft der UNIQUE-Index, nicht ein vorheriges SELECT:
  nur so können zwei gleichzeitige Anlagen nicht dasselbe Kürzel erzeugen.

## Vereins-News

| Methode | Pfad | Auth | Beschreibung |
| ------- | ---- | ---- | ------------ |
| GET | `/api/news` | angemeldet | **Aktive** Beiträge, neueste zuerst. `?limit=` optional (max. 100). Antwort: `{ news: [{ id, title, content, imageUrl, isArchived, createdAt, updatedAt, author }] }`. |
| GET | `/api/admin/news` | `admin`, `sub_admin` | Verwaltungssicht. `?status=active` (Standard) / `archived` / `all`. Antwort zusätzlich `counts: { active, archived }`. |
| POST | `/api/admin/news` | `admin`, `sub_admin` | **`multipart/form-data`**: `title` (≤150), `content` (≤5000), `image` und `image2` optional (max. 2 Bilder). Antwort `201` mit dem angelegten Beitrag. |
| PATCH | `/api/admin/news/:id` | `admin`, `sub_admin` | `{ isArchived: boolean }` – archiviert einen Beitrag oder holt ihn zurück. |
| DELETE | `/api/admin/news/:id` | `admin`, `sub_admin` | Löscht Beitrag **und** zugehöriges Bild – endgültig. |
| GET | `/api/uploads/<pfad>` | angemeldet | Ausliefern der Beitragsbilder (statisch). |

Trainer:innen dürfen News **lesen, aber nicht anlegen, archivieren oder
löschen** – der zweite `checkRole(ADMIN_ROLES)` in `adminRoutes.js` blockt sie.

### Zwei Bilder je Beitrag

Ein Beitrag darf bis zu **zwei** Bilder tragen (`image_path`, `image_path_2`;
Migration 007). Die Middleware nimmt sie in den Feldern `image` und `image2`
entgegen (`.fields()`, `files: 2`); ein drittes wird mit `400` abgelehnt.

- Die Antwort liefert `imageUrls: string[]` (0–2 Einträge, ohne Lücken).
  `imageUrl` bleibt als **erstes** Bild erhalten, damit bestehende Ansichten
  unverändert weiterlaufen.
- Wird nur `image2` geschickt, rutscht es auf Platz 1: die Oberfläche füllt die
  Plätze der Reihe nach, und ein Beitrag soll kein Loch an Platz 1 haben.
- **Jede** Datei wird einzeln auf ihre Signatur geprüft, nicht nur die erste.
  Schlägt eine fehl, werden beide wieder weggeräumt.
- `DELETE` löscht beide Dateien; `npm run uploads:sweep` liest beide Spalten
  (sonst hielte der Lauf jedes zweite Bild für verwaist).

Warum zwei Spalten und keine Tabelle `news_images`: Die Obergrenze ist bewusst
zwei. Eine 1:n-Tabelle verlangte JOIN, Sortierspalte und eigene Aufräum-Logik
für einen festen, kleinen Fall. Wird daraus je eine echte Bilderstrecke, ist
der Umbau eine Migration, die beide Spalten in Zeilen überführt.

### Archivieren statt löschen

Der Regelweg aus der Oberfläche ist **Archivieren** (`is_archived = 1`,
Migration 006), nicht Löschen:

- Der Feed (`GET /api/news`) liest ausschliesslich `is_archived = 0`, der
  Beitrag verschwindet also sofort vom Dashboard.
- Der Beitrag selbst bleibt vollständig erhalten – samt Bild – und lässt sich
  mit `{ isArchived: false }` zurückholen. Ein versehentliches Wegräumen
  kostet damit nichts mehr.
- `DELETE` gibt es weiterhin, die Oberfläche bietet es aber **nur im Archiv**
  und mit Rückfrage an. Nur dabei wird auch die Bilddatei frei; ein
  archivierter Beitrag behält sein Bild, weil er jederzeit wieder aktiv werden
  kann.

Ein `PATCH`, der nichts ändert (zweimal archivieren), liefert `200` mit einer
ehrlichen Meldung („Beitrag war bereits archiviert.") statt eines stillen
„gespeichert" – die Unterscheidung macht `setArchived` über
`WHERE is_archived <> ?`.

## System-Status (`admin` / `sub_admin`)

| Methode | Pfad | Beschreibung |
| ------- | ---- | ------------ |
| GET | `/api/admin/system` | Hardware, API-Kennzahlen, Datenbank und nuLiga-Cache in **einer** Antwort. |
| POST | `/api/admin/system/metrics/reset` | Setzt das Beobachtungsfenster der API-Statistik zurück. |
| POST | `/api/admin/system/handball-cache/clear` | Leert den nuLiga-Cache (Tabelle/Spielplan/Ticker werden neu geholt). |

Betriebsdaten verraten Hostname, Pfade und Auslastung – deshalb sind diese
Endpunkte `admin`/`sub_admin` vorbehalten, obwohl Trainer:innen `/api/admin`
sonst erreichen.

**Hardware** (`services/systemService.js`) kommt vollständig aus
Node-Bordmitteln, ohne Zusatzabhängigkeit und ohne Shell-Aufruf:

| Wert | Quelle | Anmerkung |
| ---- | ------ | --------- |
| CPU-Last | Differenz zweier `os.cpus()`-Messungen | `os.loadavg()` gibt es unter Windows nicht (immer `[0,0,0]`) – die Tick-Differenz funktioniert plattformübergreifend. Zwei Abrufe innerhalb von 500 ms liefern den letzten belastbaren Wert weiter, statt 0 % zu behaupten. |
| RAM | `os.totalmem()` / `os.freemem()` + `process.memoryUsage()` | System **und** was der Node-Prozess selbst belegt. |
| Plattenplatz | `fs.statfs()` (Node ≥ 18.15) | Fehlt die Funktion oder scheitert der Aufruf, kommt `available: false` mit Begründung – keine erfundene Zahl. |
| Uptime | `os.uptime()` / `process.uptime()` | System- und App-Laufzeit getrennt. |

**API-Kennzahlen** (`services/metricsService.js` + `middleware/metricsMiddleware.js`)
werden vollständig **im Arbeitsspeicher** gehalten:

- Kein INSERT im Hot Path. Jeder Request in die Datenbank zu schreiben wäre
  für eine Vereins-App reine Verschwendung – und ein hängender DB-Server
  würde die API mitreissen.
- Der Speicherverbrauch ist hart begrenzt: 60 Minuten-Eimer, höchstens 250
  Ländercodes, 50 Routengruppen und eine Stichprobe von 500 Antwortzeiten
  (für das 95-%-Perzentil).
- Es werden **keine** IP-Adressen, Konten oder vollständigen Pfade
  gespeichert. Pfade werden auf zwei Ebenen gekürzt (`/api/teams/MJC/members/42`
  → `/api/teams`).
- Nach einem Neustart sind die Zahlen weg; die Antwort weist mit
  `collectedSince` aus, seit wann gemessen wird.

Die Middleware hängt **ganz vorne** in `server.js` – so werden auch abgelehnte
Anfragen (CORS, 404, Rate-Limit) gezählt; gerade die sind für ein Monitoring
interessant.

### Herkunftsland der Anfragen

Node kann aus einer IP-Adresse allein **kein** Land ableiten. Dafür bräuchte es
eine GeoIP-Datenbank (MaxMind o. ä.) – eine mehrere Megabyte große Datei, die
monatlich aktualisiert werden muss. Für eine Vereins-App wäre das ein
unverhältnismäßiger Klotz.

`utils/geo.js` nimmt deshalb den Wert, den ein vorgelagerter Reverse-Proxy oder
ein CDN ohnehin kennt und als Header mitschickt – in dieser Reihenfolge:
`CF-IPCountry` (Cloudflare), `x-vercel-ip-country`, `X-AppEngine-Country`,
`Fastly-Geo-Country`, `X-Geo-Country`, `X-Country-Code`.

nginx mit `ngx_http_geoip2_module`:

```nginx
geoip2 /etc/nginx/GeoLite2-Country.mmdb {
  $geoip2_country_code country iso_code;
}
proxy_set_header X-Geo-Country $geoip2_country_code;
```

Ohne einen solchen Header wird **nicht geraten**: Anfragen aus dem lokalen Netz
(Entwicklung, LAN-Test vom Handy) zählen als „Lokales Netz", alles andere als
„Unbekannt". Die Oberfläche blendet dann einen Hinweis mit genau dieser
Erklärung ein.

**Bild-Uploads** (`config/uploads.js`, `multer`):

- erlaubt sind JPG, PNG, WEBP und GIF bis **5 MB** – **kein SVG** (kann Skripte
  enthalten)
- der Dateiname wird **verworfen** und durch 16 Zufalls-Bytes ersetzt; die
  Endung kommt aus der Whitelist (kein `../`, keine Doppelendungen, keine
  Null-Bytes)
- der MIME-Typ stammt vom Client und wird deshalb zusätzlich gegen die
  **Signatur (Magic Bytes)** der Datei geprüft; passt sie nicht, wird die Datei
  gelöscht und der Beitrag mit `400` abgelehnt
- Feld-Limits (`fields`, `parts`, `fieldSize`, `fieldNameSize`) begrenzen auch
  die Textfelder – `express.json({ limit })` greift bei `multipart/form-data`
  **nicht**
- Speicherort `backend/uploads/news/` (per `.gitignore` ausgenommen, wird beim
  ersten Upload automatisch angelegt)
- in der DB steht nur der relative Pfad, ausgeliefert wird er als
  `/api/uploads/news/<datei>` – bewusst unter `/api/`, damit der Vite-Dev-Proxy
  ihn ohne Zusatzkonfiguration mitausliefert. `helmet` setzt dabei
  `X-Content-Type-Options: nosniff` und `Cross-Origin-Resource-Policy`
- schlägt Validierung oder Signaturprüfung **nach** dem Upload fehl, löscht der
  Controller die Datei wieder; ist der Beitrag dagegen bereits gespeichert,
  bleibt sein Bild erhalten

**Verwaiste Bilder aufräumen.** Alle regulären Pfade räumen selbst auf. Bricht
eine Anfrage jedoch mittendrin ab (Tab geschlossen, Netzwerk weg,
Server-Neustart), kann eine Datei zurückbleiben:

```bash
npm run uploads:sweep            # nur anzeigen
npm run uploads:sweep -- --apply # wirklich löschen
```

### Beispiele (curl)

```bash
# Verfügbare Mannschaften
curl http://localhost:5000/api/teams

# Registrierung mit Mannschaften (teamIds optional)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Max","lastName":"Muster","email":"max@example.com","password":"geheim1234","teamIds":[1,4]}'

# Login speichert den Cookie in cookies.txt
curl -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"max@example.com","password":"geheim1234"}'

curl -b cookies.txt http://localhost:5000/api/auth/me

# Trainer: offene Beitrittsanfrage bestätigen bzw. ablehnen
curl -b cookies.txt -X POST http://localhost:5000/api/teams/MJC/members/5/confirm
curl -b cookies.txt -X DELETE "http://localhost:5000/api/teams/MJC/members/5?relationType=player"

# News lesen; Admin: Beitrag mit Bild anlegen und wieder löschen
curl -b cookies.txt http://localhost:5000/api/news
curl -b cookies.txt -X POST http://localhost:5000/api/admin/news \
  -F "title=Heimspiel am Samstag" \
  -F "content=Anwurf ist um 18:00 Uhr." \
  -F "image=@plakat.jpg"
curl -b cookies.txt -X DELETE http://localhost:5000/api/admin/news/1

curl -b cookies.txt -X POST http://localhost:5000/api/auth/logout
```

## Mannschaftsseite

Die Fan-Ansicht unter `/teams/:code` zieht ihre Daten aus zwei Quellen: Kader
und Stammdaten aus der eigenen Datenbank, Tabelle/Spielplan/Ticker aus nuLiga
(siehe nächster Abschnitt). `GET /api/teams/:code` liefert alles in einem Zug:

```jsonc
{
  "team": { "id": 4, "code": "H1", "name": "1. Herren",
            "handballTeamId": "2218498",       // null = keine Ligaanbindung
            "photoUrl": "/api/uploads/teams/…" },
  "sponsors": [ { "id": 1, "name": "…", "websiteUrl": "…" } ],
  "members": { "player": [ { "jerseyNumber": 7, "position": "rueckraum", … } ],
               "coach":  [ { "staffTitle": "Co-Trainer", … } ],
               "fan":    [ … ] },
  "counts": { "player": 12, "coach": 3, "fan": 1 },
  "canManage": true,
  "pendingMembers": [ … ]                       // nur für die Verwaltung
}
```

Schreibende Endpunkte:

| Endpunkt | Wer darf |
| -------- | -------- |
| `PATCH /api/teams/:code` (`handballTeamId`) | nur `admin` / `sub_admin` |
| `POST` / `DELETE /api/teams/:code/photo` | nur `admin` / `sub_admin` |
| `PATCH /api/teams/:code/members/:userId` (`jerseyNumber`, `position`, `staffTitle`) | Trainer:in dieser Mannschaft oder Admin |

Warum die Ligaverknüpfung nur Administration ändern darf: Eine falsche
nuLiga-Nummer zeigt allen Mitgliedern Tabelle und Spielplan einer **fremden**
Mannschaft – das ist kein Kaderdetail, sondern eine Vereins-Stammdate.

Die Kaderangaben hängen bewusst an `user_teams` und nicht an `users`: Wer in
zwei Mannschaften spielt, hat dort oft verschiedene Rückennummern und
Positionen. Eine Rückennummer darf pro Mannschaft nur einmal vergeben sein
(sonst `409`) – sonst stimmt der Spielberichtsbogen nicht mehr mit der App
überein.

Mannschaftsfotos laufen über dieselbe geprüfte Upload-Strecke wie die
News-Bilder (`config/uploads.js`): Zufallsname, Whitelist der MIME-Typen und
zusätzlich eine Signaturprüfung des Dateiinhalts. Sie liegen unter
`uploads/teams/`. **Neue Bildarten müssen in `scripts/sweep-uploads.js`
eingetragen werden** – sonst hält das Aufräumskript ihre Dateien für verwaist.

## Handball-Modul (nuLiga / HHV)

Tabellen, Spielpläne und Spielverläufe stammen aus dem nuLiga-Portal des
Hessischen Handball-Verbands (`hhv-handball.liga.nu`). nuLiga hat **keine
JSON-Schnittstelle** – die Daten werden aus dem HTML der öffentlichen Seiten
gelesen (`axios` + `cheerio`), serverseitig gecacht und als eigenes, stabiles
Format ausgeliefert.

| Endpunkt | nuLiga-Seite | Cache |
| -------- | ------------ | ----- |
| `GET /api/handball/table/:teamId` | `teamPortrait` → `groupPage` | 15 Min |
| `GET /api/handball/schedule/:teamId` | `teamPortrait` | 15 Min |
| `GET /api/handball/ticker/:gameId` | `groupMeetingReport` | 10 Sek (laufendes Spiel), sonst 10 Min |

### IDs

* **`:teamId`** ist nuLigas `teamtable`-Nummer, rein numerisch (z. B. `2086554`).
  Sie steht in der URL der Mannschaftsseite:
  `…/teamPortrait?teamtable=2086554`. Die Tabelle braucht dieselbe ID – welche
  Staffel dazugehört, liest das Backend selbst von der Mannschaftsseite ab.
* **`:gameId`** ist zusammengesetzt: `<meeting>.<group>.<championship base64url>`,
  z. B. `7929683.421558.SEhWIDI1LzI2`. Grund: `groupMeetingReport` antwortet mit
  404, wenn auch nur einer der drei Parameter fehlt. Diese IDs baut immer der
  Mapper beim Auslesen des Spielplans – das Frontend reicht sie nur zurück.

Beide Muster werden vor dem Aufbau der URL streng geprüft (`config/handball.js`),
damit über die Route weder fremde Pfade noch fremde Hosts erreichbar sind.

### Warum der Mapper so gebaut ist

nuLiga liefert HTML ohne stabile IDs oder Klassen an den Zellen. Feste
Spaltennummern wären hier schlicht falsch:

* Dieselbe Spalte enthält bei gespielten Partien das **Ergebnis**, bei noch
  nicht gespielten die **Schiedsrichter**.
* Das **Datum** steht nur in der ersten Zeile eines Spieltags; Folgezeilen
  lassen die Zelle leer.
* Verlegte Spiele tragen einen Marker an der Uhrzeit (`19:00 t`).
* Siege/Unentschieden/Niederlagen heißen `S`/`U`/`N` – ein Teilstring-Vergleich
  würde `S` in „Mannschaft" finden.

Deshalb: Spalten über ihre **Überschrift** (exakt vor Teilstring), Ergebnis und
Spiel-ID über den **Inhalt** (`34:32` bzw. ein Link mit `meeting=`), Datum
**fortschreiben**. Anwurfzeiten werden explizit von `Europe/Berlin` nach UTC
umgerechnet, damit der Spielplan auch auf einem UTC-Server stimmt.

### Ausfallsicherheit

Unverändert dreistufig – und bewusst auch gegen einen nuLiga-**Umbau**
abgesichert: greift ein Selektor ins Leere, ist das für den Service derselbe
Fall wie ein Netzwerkfehler.

```jsonc
{
  "rows": [ /* … */ ],
  "meta": {
    "source": "network",   // network | cache | stale | unavailable
    "stale": false,        // true -> Verband nicht erreichbar, Daten von früher
    "available": true,     // false -> gar nichts vorhanden (leeres DTO)
    "fetchedAt": "2026-09-09T12:59:16.956Z"
  }
}
```

Die Antwort ist deshalb **immer HTTP 200**. Zusätzlich bündelt der Service
gleichzeitige Anfragen auf denselben Schlüssel: 25 parallele Abrufe lösen
nachweislich genau **einen** Request zum Verband aus.

### Absicherung gegen die Fremdquelle

Das Modul redet mit einem System, das uns nicht gehört. Entsprechend sind die
Annahmen darüber eng gefasst:

* **IDs** werden vor dem URL-Bau gegen ein striktes Muster geprüft
  (`teamId` rein numerisch, `gameId` als `meeting.group.base64url`). Die drei
  Bestandteile der Spiel-ID landen über `URLSearchParams` in der Query und
  werden dabei vollständig kodiert – Parameter-, Pfad- und CRLF-Injection
  laufen ins Leere.
* **Weiterleitungen dürfen den Host nicht wechseln** (`beforeRedirect` in
  `handballClient.js`). Ohne das könnte eine Weiterleitung des Verbandsservers
  – oder ein Angriff auf dessen DNS – uns auf `127.0.0.1` oder auf
  Cloud-Metadaten (`169.254.169.254`) lenken.
* **Gescrapte Inhalte sind ausschließlich Text.** cheerio liefert per `.text()`
  nur Textknoten, React escapt beim Rendern. Ein Mannschaftsname mit
  `<script>` erscheint als sichtbarer Text, nicht als Markup.
* **Fehlt die erwartete Tabelle**, wirft der Mapper einen
  `HandballStructureError`. Das ist der Fall „nuLiga liefert HTTP 200, aber
  eine Wartungs-/Sperrseite". Ohne diese Unterscheidung würde so eine Seite als
  gültiges LEERES Ergebnis gecacht und würde die Notreserve überschreiben – der
  Spielstand verschwände mitten im Spiel. Im Log ist der Fall an
  `SEITENSTRUKTUR GEÄNDERT?` zu erkennen und bedeutet: `handballMapper.js`
  anpassen.
* **Beide Caches sind in der Schlüsselzahl begrenzt**
  (`HANDBALL_MAX_CACHE_KEYS`, Standard 500). Läuft ein Cache voll, werden die
  Einträge mit der kürzesten Restlaufzeit verdrängt.
* **Schreibende SQL-Zugriffe** nutzen Spalten-Whitelists
  (`WRITABLE_TEAM_COLUMNS`, `WRITABLE_RELATION_COLUMNS`) – analog zu
  `WRITABLE_USER_COLUMNS` in `userRepository.js`. Werte laufen immer über `?`,
  Spaltennamen dürfen nie aus einer Anfrage stammen.
* **Sponsorenlinks** werden beim Auslesen auf `http`/`https` begrenzt
  (`getSponsors`); alles andere wird zu `null` und damit nicht verlinkt.

### Grenzen (bekannt und bewusst)

* **Künftige Spiele haben keine `id`.** Die Spiel-ID entsteht aus dem Link auf
  den Spielbericht, den nuLiga erst mit dem Bericht anlegt. `ScheduleWidget`
  macht solche Zeilen deshalb nicht anklickbar.
* **Der Spielplan nennt nur Hallennummern**, keine Hallennamen (`Halle 12102`).
  Den echten Namen liefert erst der Spielbericht.
* **Live-Ticker hängt an nuScore.** Der Spielverlauf erscheint nur, wenn am
  Zeitnehmertisch elektronisch erfasst wird. Liegt noch nichts vor, zeigt das
  Widget den Hinweis, dass keine Ereignisse gemeldet sind.

```bash
# Beispiele (Cookie aus dem Login vorausgesetzt)
curl -b cookies.txt http://localhost:5000/api/handball/table/2086554
curl -b cookies.txt http://localhost:5000/api/handball/schedule/2086554
curl -b cookies.txt http://localhost:5000/api/handball/ticker/7929683.421558.SEhWIDI1LzI2
```

## Frontend-Anbindung

`fetch` muss `credentials: 'include'` setzen, damit der Cookie mitgesendet
wird. Im Normalfall läuft das Frontend über den Vite-Dev-Proxy (same-origin),
dann ist CORS gar nicht beteiligt. Für direkten Zugriff auf Port 5000 steuert
`CLIENT_ORIGIN` die erlaubten Origins (mehrere kommagetrennt).

## Sicherheitsmaßnahmen

| Maßnahme | Wo |
| -------- | -- |
| Kein Fallback-`JWT_SECRET` – Start bricht ab, wenn es fehlt oder ein Platzhalter ist | `config/auth.js` |
| JWT nur mit `HS256` verifiziert (kein Algorithm-Confusion) | `middleware/authMiddleware.js` |
| Cookie: `httpOnly`, `sameSite=lax`, `secure` über `COOKIE_SECURE`/`NODE_ENV` | `config/auth.js` |
| Cookie-Lebensdauer wird aus dem `exp` des Tokens abgeleitet | `controllers/authController.js` |
| Rolle **und Sperrstatus** werden bei jeder RBAC-Prüfung frisch aus der DB gelesen | `middleware/authMiddleware.js` |
| `/api/auth/me` beendet die Sitzung, wenn das Konto gelöscht oder gesperrt wurde | `controllers/authController.js` |
| Rate-Limit: Login 10/15 min, Registrierung 5/h pro IP; `trust proxy` konfiguriert (`TRUST_PROXY`) | `routes/authRoutes.js`, `server.js` |
| CSRF-Schutz: Origin-Prüfung bei allen schreibenden Requests | `server.js` |
| Sicherheits-Header via `helmet` | `server.js` |
| Alle SQL-Queries mit `?`-Platzhaltern; dynamische Spaltennamen nur aus fester Allowlist | überall, `repositories/userRepository.js` |
| Selbst-Aussperrung und "letzter Admin" werden serverseitig verhindert | `controllers/adminController.js` |
| `sub_admin` kann Admin-Konten nicht bearbeiten und die Rolle `admin` nicht vergeben | `controllers/adminController.js` |
| Team-Verwaltung nur für Admin/Sub-Admin oder **bestätigte:n** `coach` der jeweiligen Mannschaft | `controllers/teamsController.js` |
| Zentraler Error-Handler – keine Stacktraces an den Client | `server.js` |
| News anlegen/löschen nur `admin`+`sub_admin` (zweiter `checkRole` **vor** multer – ein Upload startet ohne Berechtigung gar nicht erst) | `routes/adminRoutes.js` |
| Upload: MIME-Whitelist ohne SVG, Zufallsdateiname, Endung aus der Whitelist | `config/uploads.js` |
| Upload: **Signaturprüfung** (Magic Bytes) – der Inhalt muss dem Format entsprechen | `config/uploads.js`, `controllers/newsController.js` |
| Upload: Limits für Dateigröße **und** Anzahl/Größe der Textfelder (`express.json` greift bei multipart nicht) | `config/uploads.js` |
| Upload-Pfade werden gegen das Upload-Wurzelverzeichnis geprüft (kein Ausbruch über manipulierte DB-Werte) | `config/uploads.js` |
| multer-/busboy-Fehler werden als 4xx beantwortet, nicht als 500 mit interner Meldung | `config/uploads.js`, `server.js` |

### Bekannte Restrisiken

- **Logout ist clientseitig**: Das JWT bleibt bis zum Ablauf (`JWT_EXPIRES_IN`)
  technisch gültig. Für echte Sofort-Invalidierung wäre eine Token-Denylist
  oder eine Sitzungstabelle nötig. Kürzeres `JWT_EXPIRES_IN` reduziert das
  Zeitfenster.
- **User-Enumeration bei der Registrierung**: `409` verrät, dass eine
  E-Mail-Adresse bereits registriert ist. Bewusst beibehalten, weil eine
  generische Meldung die Registrierung unbrauchbar machen würde. Der Login
  gibt bewusst keine Auskunft (gleiche Meldung + Dummy-Hash gegen
  Timing-Analyse).
- **Rate-Limit im Arbeitsspeicher**: Bei mehreren Server-Instanzen wäre ein
  gemeinsamer Store (z. B. Redis) nötig. Hinter einem Proxy muss `TRUST_PROXY`
  korrekt gesetzt sein (Standard `loopback` deckt den Vite-Dev-Proxy ab; hinter
  echtem LB `TRUST_PROXY=1`), sonst greift die Zählung pro IP nicht.
- **Roster-Sichtbarkeit**: Jede:r angemeldete Nutzer:in kann den bestätigten
  Kader (Namen + Rollen, keine E-Mails) jeder Mannschaft über `GET
  /api/teams/:code` einsehen. Bewusst so – im Vereinskontext sind Kader nicht
  geheim. E-Mails und offene Beitrittsanfragen sehen nur Verwaltende.
- **`GET /api/admin/users` für `trainer`**: Trainer:innen sehen die komplette
  Mitgliederliste inkl. E-Mail, um Spieler:innen Mannschaften zuzuordnen.
  Falls das enger gefasst werden soll, müsste die Antwort für `trainer`
  reduziert werden.
- **News haben keine Eigentümerschaft**: Jede:r `admin`/`sub_admin` darf jeden
  Beitrag archivieren und löschen – auch den einer anderen Person. Für ein
  Schwarzes Brett ist das gewollt; soll nur der/die Verfasser:in (plus
  `admin`) löschen dürfen, müssten `archiveNews`/`deleteNews` zusätzlich
  `author_id` gegen `req.userId` prüfen.
- **Archivierte Beiträge behalten ihr Bild**: Das ist Absicht – der Beitrag
  kann jederzeit zurückgeholt werden. Wer viel archiviert und nie endgültig
  löscht, sammelt entsprechend Dateien an; `npm run uploads:sweep` findet nur
  Bilder ohne Datensatz, nicht die von archivierten Beiträgen.
- **Betriebs-Kennzahlen überleben keinen Neustart**: `metricsService` hält
  alles im Arbeitsspeicher (bewusst, siehe System-Status). Für eine Historie
  über Wochen wäre ein echtes Monitoring (Prometheus o. ä.) das richtige
  Werkzeug, nicht diese API.
- **Kennzahlen sind pro Prozess**: Bei mehreren Server-Instanzen zeigt der
  System-Status nur die Instanz, die den Request beantwortet hat – dasselbe
  Thema wie beim Rate-Limit.
- **Kein Rate-Limit auf `POST /api/admin/news`**: Das Anlegen ist auf
  `admin`/`sub_admin` beschränkt, ein Missbrauch setzt also ein übernommenes
  Verwaltungskonto voraus. Die Feld- und Dateigrößen-Limits begrenzen den
  Schaden pro Anfrage; bei Bedarf lässt sich derselbe `express-rate-limit`
  wie bei den Auth-Routen davorhängen.
- **Bilder sind an die Sitzung gebunden, nicht an den Beitrag**: `/api/uploads`
  verlangt einen Login, unterscheidet aber nicht, welcher Beitrag zu welchem
  Bild gehört. Wer die (zufällige, 128 Bit lange) URL kennt und angemeldet
  ist, kann das Bild laden – für vereinsinterne Inhalte ausreichend.
