# Backend – HSG Hinterland App

Express-API mit MySQL (`mysql2`), Passwort-Hashing (`bcrypt`) und JWT-Auth
über einen HttpOnly-Cookie. Rollenbasierte Zugriffskontrolle (RBAC).

## Setup

1. XAMPP starten (Apache + MySQL).
2. `.env` anlegen: `cp .env.example .env` und Werte anpassen
   (v. a. `JWT_SECRET`).
3. Abhängigkeiten installieren: `npm install`
4. Datenbank aufsetzen:
   - Frische DB: `backend/db/schema.sql` in phpMyAdmin ausführen.
   - Bestehende DB: `npm run migrate` (führt alle `db/migrations/*.sql` aus,
     idempotent – bereits vorhandene Tabellen/Spalten werden übersprungen).
5. Server starten: `npm run dev` (nodemon) oder `npm start`

Server: <http://localhost:5000>

## Projektstruktur

```
backend/
  config/
    auth.js       JWT-/Cookie-Konfiguration
    db.js         MySQL Connection-Pool (Modul)
  controllers/
    authController.js    register / login / logout / me
    adminController.js    listUsers / updateUser (inkl. Sub-Admin-Sperren)
    teamsController.js    listTeams / getTeam / candidates / add / remove / callup
  middleware/
    authMiddleware.js    authenticate (JWT-Cookie) + checkRole (RBAC)
  utils/
    roles.js      Rollen-, Beziehungs- und Dienst-Konstanten
    teams.js      Validierung + Schreiben der user_teams
    services.js   Validierung + Schreiben der user_services
  routes/
    authRoutes.js
    adminRoutes.js
    teamsRoutes.js
  db/
    schema.sql
    migrate.js                       Runner: npm run migrate
    migrations/001_add_role_to_users.sql
    migrations/002_add_teams.sql
    migrations/003_add_team_relations.sql
    migrations/004_add_user_services.sql
    migrations/005_add_sub_admin_role.sql
  server.js
```

## Datenbank

| Tabelle         | Zweck |
| --------------- | ----- |
| `users`         | Konten inkl. `role` (ENUM) und `is_approved` |
| `teams`         | Mannschaften (`id`, `name`, `code`) – Seed: MJC, MJB, MJA, H1, H2, D1 |
| `user_teams`    | n:m Nutzer ↔ Mannschaften mit `relation_type` ENUM(`player`,`coach`,`fan`); PK `(user_id, team_id, relation_type)` – eine Person kann pro Team mehrere Beziehungen haben |
| `user_services` | Helferdienste, `service_type` ENUM(`zeitnehmer`,`verkaufsdienst`) |

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
| `trainer`   | Mitgliederliste sehen, Mannschaftszuordnung ändern; Rolle/Freigabe gesperrt (`403`) |
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

## Auth-Endpunkte

| Methode | Pfad                | Body                                      | Beschreibung |
| ------- | ------------------- | ---------------------------------------- | ------------ |
| POST    | `/api/auth/register`| `firstName, lastName, email, password, teams?, services?` | Legt User mit `is_approved = 0`, `role = 'spieler'` an. `teams: [{ teamId, relationType }]` und `services: ['zeitnehmer', …]` optional, transaktional gespeichert. `teamIds: [1,2]` bleibt als Kurzform für Spieler-Zuordnungen erlaubt. |
| POST    | `/api/auth/login`   | `email, password`                       | Setzt JWT (inkl. `role`) als HttpOnly-Cookie. Antwort enthält `user.role`, `user.teams` und `user.services`. Nur für freigegebene User. |
| POST    | `/api/auth/logout`  | –                                       | Löscht den Cookie. |
| GET     | `/api/auth/me`      | – (Cookie)                              | Daten des angemeldeten Users inkl. `role`, `teams` (`[{ id, code, name, relationType }]`) und `services`. |

## Mannschaften

| Methode | Pfad                                   | Auth | Beschreibung |
| ------- | -------------------------------------- | ---- | ------------ |
| GET     | `/api/teams`                           | –    | Alle Mannschaften. Öffentlich (Registrierungsformular). |
| GET     | `/api/teams/:code`                     | angemeldet | Mannschaft + Kader nach `player`/`coach`/`fan` und `canManage`. E-Mail-Adressen nur für Verwaltende. |
| GET     | `/api/teams/:code/candidates`          | Verwaltung | Freigegebene Mitglieder ohne diese Beziehung (`?relationType=`). |
| POST    | `/api/teams/:code/members`             | Verwaltung | `{ userId, relationType }` – Beziehung anlegen. |
| DELETE  | `/api/teams/:code/members/:userId`     | Verwaltung | `?relationType=` – Beziehung entfernen. |
| POST    | `/api/teams/:code/callup`              | Verwaltung | `{ userId, targetTeamCode }` – Spieler:in hochrufen (bestehende Zuordnung bleibt). |

„Verwaltung“ = `admin`, `sub_admin` oder als `coach` dieser Mannschaft
eingetragen. Sonst `403`. Trainer:innen können sich nicht selbst als Trainer:in
der eigenen Mannschaft entfernen (sonst verlieren sie den Zugriff).

## Verwaltungs-Endpunkte (`checkRole(['admin', 'sub_admin', 'trainer'])`)

| Methode | Pfad                     | Body                                                  | Beschreibung |
| ------- | ------------------------ | ----------------------------------------------------- | ------------ |
| GET     | `/api/admin/users`       | – (Cookie)                                            | Alle Nutzer inkl. `teams` (mit `relationType`) und `services`. |
| PATCH   | `/api/admin/users/:id`   | `role?`, `isApproved?`, `teamIds?`, `services?`       | `teamIds` steuert die **Spieler**-Zuordnung (Trainer-/Fan-Beziehungen laufen über die Mannschaftsseite). Rolle/Freigabe nur `admin`+`sub_admin`. Alles transaktional. |

Sperren für `sub_admin` (jeweils `403`):

- Bearbeiten eines Kontos mit `role = 'admin'` – auch reine Team-Änderungen
- Setzen von `role = 'admin'` bei irgendeinem Konto

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

# Als admin/trainer: Mannschaftszuordnung ändern (volle Liste)
curl -b cookies.txt -X PATCH http://localhost:5000/api/admin/users/2 \
  -H "Content-Type: application/json" \
  -d '{"teamIds":[2]}'

curl -b cookies.txt -X POST http://localhost:5000/api/auth/logout
```

> Hinweis: Der Login schlägt mit HTTP 403 fehl, solange ein Admin den User
> nicht freigegeben hat. Zum Testen in phpMyAdmin `is_approved = 1` setzen.

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
| Rolle wird bei jeder RBAC-Prüfung frisch aus der DB gelesen | `middleware/authMiddleware.js` |
| `/api/auth/me` beendet die Sitzung, wenn die Freigabe entzogen wurde | `controllers/authController.js` |
| Rate-Limit: Login 10/15 min, Registrierung 5/h pro IP | `routes/authRoutes.js` |
| CSRF-Schutz: Origin-Prüfung bei allen schreibenden Requests | `server.js` |
| Sicherheits-Header via `helmet` | `server.js` |
| Alle SQL-Queries ausschließlich mit `?`-Platzhaltern (keine String-Konkatenation von Werten) | überall |
| Selbst-Aussperrung und "letzter Admin" werden serverseitig verhindert | `controllers/adminController.js` |
| Zentraler Error-Handler – keine Stacktraces an den Client | `server.js` |

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
  gemeinsamer Store (z. B. Redis) nötig.
