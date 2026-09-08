# Backend – HSG Hinterland App

Express-API mit MySQL (`mysql2`), Passwort-Hashing (`bcrypt`) und JWT-Auth
über einen HttpOnly-Cookie.

## Setup

1. XAMPP starten (Apache + MySQL).
2. In phpMyAdmin die Datenbank anlegen bzw. das Schema ausführen:
   `backend/db/schema.sql`
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
    authController.js   register / login / logout / me
  middleware/
    authMiddleware.js   prüft JWT-Cookie
  routes/
    authRoutes.js
  db/
    schema.sql
  server.js
```

## Auth-Endpunkte

| Methode | Pfad                | Body                                      | Beschreibung |
| ------- | ------------------- | ---------------------------------------- | ------------ |
| POST    | `/api/auth/register`| `firstName, lastName, email, password`   | Legt User mit `is_approved = 0` an. |
| POST    | `/api/auth/login`   | `email, password`                       | Setzt JWT als HttpOnly-Cookie. Nur für freigegebene User (`is_approved = 1`). |
| POST    | `/api/auth/logout`  | –                                       | Löscht den Cookie. |
| GET     | `/api/auth/me`      | – (Cookie)                              | Gibt die Daten des angemeldeten Users zurück. |

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
wird. Die erlaubte Origin wird über `CLIENT_ORIGIN` in der `.env` gesteuert.
