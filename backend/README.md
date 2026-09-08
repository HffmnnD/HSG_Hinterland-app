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

  routes/                nur URL -> Controller-Funktion + Middleware
    authRoutes.js
    adminRoutes.js       Mitglieder + News (News zusätzlich admin/sub_admin)
    teamsRoutes.js
    newsRoutes.js        GET /api/news (alle angemeldeten Mitglieder)

  middleware/
    authMiddleware.js    authenticate (JWT-Cookie) + checkRole (RBAC)

  controllers/           HTTP + Geschäftsregeln, KEIN SQL
    authController.js    register / login / logout / me
    adminController.js    listUsers / updateUser (inkl. Sub-Admin-Sperren)
    teamsController.js    listTeams / getTeam / candidates / add / remove / callup
    newsController.js     listNews / createNews / deleteNews (inkl. Bild-Aufräumen)

  repositories/          gesamter Datenbankzugriff (alle SELECT/INSERT/JOINs)
    userRepository.js    users + zusammengesetztes Profil, Transaktionen
    teamRepository.js    teams + user_teams (Kader, Kandidaten, Zuordnungen)
    serviceRepository.js user_services
    newsRepository.js    news (Feed, Anlegen, Löschen)

  scripts/
    sweep-uploads.js     npm run uploads:sweep – verwaiste Bilder finden/löschen

  uploads/               hochgeladene Beitragsbilder (nicht im Git)
    news/

  utils/
    roles.js             erlaubte Enum-Werte (Rollen, Beziehungen, Dienste)
    validation.js        Eingabe-Prüfung -> { ok, ... } | { ok:false, status, message }

  db/
    schema.sql           laufend gepflegte, kommentierte Referenz
    migrate.js            Runner: npm run migrate (einmalig je Datei, via schema_migrations)
    migrations/
      001_initial_schema.sql             eingefrorener Startzustand
      002_team_confirmation.sql          is_confirmed + Freigabe abgeschafft
      003_activate_existing_accounts.sql Bestandskonten aktivieren
      004_news_table.sql                 Tabelle news (Vereins-Ankündigungen)
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
| `teams`             | Mannschaften (`id`, `name`, `code`) – Seed: MJC, MJB, MJA, H1, H2, D1 |
| `user_teams`        | n:m Nutzer ↔ Mannschaften mit `relation_type` ENUM(`player`,`coach`,`fan`) und `is_confirmed` (0 = offene Anfrage, 1 = vom Trainer bestätigt); PK `(user_id, team_id, relation_type)` |
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

| Methode | Pfad                     | Body                                                  | Beschreibung |
| ------- | ------------------------ | ----------------------------------------------------- | ------------ |
| GET     | `/api/admin/users`       | – (Cookie)                                            | Alle Nutzer inkl. `teams` (mit `relationType`) und `services`. |
| PATCH   | `/api/admin/users/:id`   | `role?`, `isApproved?`, `teamIds?`, `services?`       | `teamIds` steuert die **Spieler**-Zuordnung (bestätigt; Trainer-/Fan-Beziehungen laufen über die Mannschaftsseite). `role` / `isApproved` (= Konto sperren/entsperren) nur `admin`+`sub_admin`. Alles transaktional. |

Sperren für `sub_admin` (jeweils `403`):

- Bearbeiten eines Kontos mit `role = 'admin'` – auch reine Team-Änderungen
- Setzen von `role = 'admin'` bei irgendeinem Konto

## Vereins-News

| Methode | Pfad | Auth | Beschreibung |
| ------- | ---- | ---- | ------------ |
| GET | `/api/news` | angemeldet | Alle Beiträge, **neueste zuerst**. `?limit=` optional (max. 100). Antwort: `{ news: [{ id, title, content, imageUrl, createdAt, updatedAt, author }] }`. |
| POST | `/api/admin/news` | `admin`, `sub_admin` | **`multipart/form-data`**: `title` (≤150), `content` (≤5000), `image` optional. Antwort `201` mit dem angelegten Beitrag. |
| DELETE | `/api/admin/news/:id` | `admin`, `sub_admin` | Löscht Beitrag **und** zugehöriges Bild. |
| GET | `/api/uploads/<pfad>` | angemeldet | Ausliefern der Beitragsbilder (statisch). |

Trainer:innen dürfen News **lesen, aber nicht anlegen oder löschen** – der
zweite `checkRole(ADMIN_ROLES)` in `adminRoutes.js` blockt sie.

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
  Beitrag löschen – auch den einer anderen Person. Für ein Schwarzes Brett ist
  das gewollt; soll nur der/die Verfasser:in (plus `admin`) löschen dürfen,
  müsste `deleteNews` zusätzlich `author_id` gegen `req.userId` prüfen.
- **Kein Rate-Limit auf `POST /api/admin/news`**: Das Anlegen ist auf
  `admin`/`sub_admin` beschränkt, ein Missbrauch setzt also ein übernommenes
  Verwaltungskonto voraus. Die Feld- und Dateigrößen-Limits begrenzen den
  Schaden pro Anfrage; bei Bedarf lässt sich derselbe `express-rate-limit`
  wie bei den Auth-Routen davorhängen.
- **Bilder sind an die Sitzung gebunden, nicht an den Beitrag**: `/api/uploads`
  verlangt einen Login, unterscheidet aber nicht, welcher Beitrag zu welchem
  Bild gehört. Wer die (zufällige, 128 Bit lange) URL kennt und angemeldet
  ist, kann das Bild laden – für vereinsinterne Inhalte ausreichend.
