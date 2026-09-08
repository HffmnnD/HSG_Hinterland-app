# Backend – HSG Hinterland App

Express-API mit MySQL (`mysql2`), Passwort-Hashing (`bcrypt`) und JWT-Auth
über einen HttpOnly-Cookie. Rollenbasierte Zugriffskontrolle (RBAC).

## Setup

1. XAMPP starten (Apache + MySQL).
2. In phpMyAdmin die Datenbank anlegen bzw. das Schema ausführen:
   `backend/db/schema.sql`
   – Bestehende DB: Migration `backend/db/migrations/001_add_role_to_users.sql`
   ausführen.
3. `.env` anlegen: `cp .env.example .env` und Werte anpassen
   (v. a. `JWT_SECRET`).
4. Abhängigkeiten installieren: `npm install`
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
    adminController.js    listUsers / updateUser (nur Rolle 'admin')
  middleware/
    authMiddleware.js    authenticate (JWT-Cookie) + checkRole (RBAC)
  routes/
    authRoutes.js
    adminRoutes.js
  db/
    schema.sql
    migrations/001_add_role_to_users.sql
  server.js
```

## Rollen (RBAC)

`users.role` ist ein ENUM: `admin`, `trainer`, `spieler`, `zuschauer`
(Standard `spieler`). Die Rolle wird bei Registrierung **nicht** vom Client
gesetzt, sondern nur von einem Admin über `/api/admin/users/:id`.

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
| POST    | `/api/auth/register`| `firstName, lastName, email, password`   | Legt User mit `is_approved = 0`, `role = 'spieler'` an. |
| POST    | `/api/auth/login`   | `email, password`                       | Setzt JWT (inkl. `role`) als HttpOnly-Cookie. Antwort enthält `user.role`. Nur für freigegebene User. |
| POST    | `/api/auth/logout`  | –                                       | Löscht den Cookie. |
| GET     | `/api/auth/me`      | – (Cookie)                              | Gibt die Daten des angemeldeten Users inkl. `role` zurück. |

## Admin-Endpunkte (`checkRole('admin')`)

| Methode | Pfad                     | Body                          | Beschreibung |
| ------- | ------------------------ | ----------------------------- | ------------ |
| GET     | `/api/admin/users`       | – (Cookie)                    | Liste aller Nutzer. |
| PATCH   | `/api/admin/users/:id`   | `role?` und/oder `isApproved?`| Rolle zuweisen / Konto freischalten. |

### Beispiele (curl)

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Max","lastName":"Muster","email":"max@example.com","password":"geheim1234"}'

# Login speichert den Cookie in cookies.txt
curl -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"max@example.com","password":"geheim1234"}'

curl -b cookies.txt http://localhost:5000/api/auth/me

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
