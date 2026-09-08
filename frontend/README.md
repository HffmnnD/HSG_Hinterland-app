# Frontend – HSG Hinterland App

React (Vite) + Tailwind CSS v4 + React Router + PWA. Authentifizierungs-UI mit
React Context und rollenbasiertem Routen-Schutz (RBAC).

## Setup

```bash
npm install
cp .env.example .env   # bei Bedarf VITE_API_BASE_URL anpassen
npm run dev            # http://localhost:5173
```

Das Backend muss parallel laufen (`../backend`, http://localhost:5000).
`VITE_API_BASE_URL` steuert die API-Basis-URL.

## Struktur

```
frontend/src/
  main.jsx                     <BrowserRouter> + <AuthProvider>
  App.jsx                      <Routes>: /login, / (geschützt), /admin (nur admin), * -> /
  context/
    AuthContext.jsx            globaler Auth-State: user, role, loading, error
                               + login() / register() / logout() / refresh()
                               prüft beim Start GET /api/auth/me
  lib/
    api.js                     fetch-Wrapper, IMMER credentials: 'include'
    roles.js                   Rollen-Konstanten + deutsche Labels
  components/
    FullScreenLoader.jsx
    ProtectedRoute.jsx         Routen-Schutz nach Login-Status + Rolle
    Dashboard.jsx              geschützte Ansicht; Admin-Bereich nur bei role === 'admin'
    AdminPage.jsx              /admin: Mitgliederliste, Freigabe & Rollen (nur admin)
    auth/
      AuthScreen.jsx           Umschalter Login <-> Registrierung
      AuthLayout.jsx           mobile-first zentriertes Karten-Layout
      LoginForm.jsx            E-Mail/Passwort, Fehler inkl. 403 "nicht freigeschaltet"
      RegisterForm.jsx         firstName/lastName/email/password + Erfolgshinweis
      TextField.jsx / Alert.jsx
```

## Routen & Rollen-Schutz

| Pfad     | Schutz                                    |
| -------- | ----------------------------------------- |
| `/login` | Öffentlich; eingeloggt → Redirect auf `/` |
| `/`      | `<ProtectedRoute>` – jeder eingeloggte User |
| `/admin` | `<ProtectedRoute allowedRoles={['admin']}>` |
| `*`      | Redirect auf `/`                          |

`ProtectedRoute` verhält sich so:

- lädt noch → Ladeanzeige
- nicht eingeloggt → `<Navigate to="/login" />`
- Rolle nicht in `allowedRoles` → `<Navigate to="/" />`
- sonst → `children`

Die Rolle kommt aus `useAuth().role` (aus `GET /api/auth/me` bzw. der
Login-Antwort). Der Routen-Schutz ist nur UX – die eigentliche Autorisierung
macht das Backend (`checkRole`).

## Auth-Fluss

1. Beim Laden fragt der `AuthProvider` `GET /api/auth/me` ab (Cookie-Check).
2. `login()` → `POST /api/auth/login`; das Backend setzt ein HttpOnly-Cookie
   (für JS nicht lesbar). Bei Erfolg wird `user` gesetzt → App zeigt das Dashboard.
3. Nicht freigeschaltete Accounts (`is_approved = 0`) erhalten HTTP 403; der
   Login-Screen zeigt dazu einen Hinweis.
4. `register()` → `POST /api/auth/register`; danach Erfolgsmeldung mit Hinweis
   auf die nötige Admin-Freischaltung.
5. `logout()` → `POST /api/auth/logout` löscht das Cookie; `user` wird `null`.

Alle Requests laufen über `apiFetch()` mit `credentials: 'include'`, damit das
HttpOnly-Cookie gesendet und empfangen wird. Das Backend muss die Origin des
Dev-Servers per CORS mit `credentials: true` erlauben (`CLIENT_ORIGIN`).

## Scripts

| Befehl            | Zweck                     |
| ----------------- | ------------------------- |
| `npm run dev`     | Dev-Server (HMR)          |
| `npm run build`   | Production-Build (`dist`) |
| `npm run preview` | Build lokal testen        |
| `npm run lint`    | ESLint                    |
