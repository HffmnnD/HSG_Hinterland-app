# Frontend – HSG Hinterland App

React (Vite) + Tailwind CSS v4 + React Router + PWA. Authentifizierungs-UI mit
React Context und rollenbasiertem Routen-Schutz (RBAC).

## Setup

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:5173
```

Das Backend muss parallel laufen (`../backend`, http://localhost:5000).

### API-Anbindung über den Dev-Proxy

`VITE_API_BASE_URL` bleibt **leer**. Dann verwendet `apiFetch()` relative
Pfade (`/api/...`), die der Vite-Dev-Proxy an das Backend weiterreicht
(`API_PROXY_TARGET`, Standard `http://localhost:5000`).

Vorteil: Frontend und API teilen sich dieselbe Origin. Damit entfallen CORS
und – wichtiger – das Auth-Cookie funktioniert auch beim Testen vom Handy
über die LAN-IP (`http://<LAN-IP>:5173`). Trägt man stattdessen eine absolute
`VITE_API_BASE_URL` mit anderem Host ein, ist der Request cross-site und der
`SameSite=Lax`-Cookie wird nach einem Reload nicht mehr mitgeschickt – die
Sitzung geht dann bei jedem Neuladen verloren.

## Struktur

```
frontend/src/
  main.jsx                     <BrowserRouter> + <AuthProvider>
  App.jsx                      <Routes>: /login, / (geschützt), /admin (admin+trainer), * -> /
  context/
    AuthContext.jsx            globaler Auth-State: user, role, teams, loading, error
                               + login() / register(…, teamIds) / logout() / refresh()
                               prüft beim Start GET /api/auth/me
  hooks/
    useTeams.js                lädt GET /api/teams (öffentlich)
  lib/
    api.js                     fetch-Wrapper, IMMER credentials: 'include'
    roles.js                   Rollen-Konstanten, Labels und Badges
    participation.js           Beteiligungsarten, Beziehungstypen, Helferdienste
  components/
    FullScreenLoader.jsx
    ErrorBoundary.jsx          fängt Render-Fehler ab (keine weisse Seite)
    ProtectedRoute.jsx         Routen-Schutz nach Login-Status + Rolle
    TeamSelect.jsx             Mannschafts-Mehrfachauswahl als Toggle-Chips
    Dashboard.jsx              „Meine Mannschaften“ (nach Beziehung gruppiert),
                               Helferdienste, Rollen-Badge, Verwaltungs-Karte
    AdminPage.jsx              /admin: Mitgliederliste inkl. Sub-Admin-Sperren
    TeamPage.jsx               /teams/:code: Kader + Verwaltung für Trainer:innen
    auth/
      AuthScreen.jsx           Umschalter Login <-> Registrierung
      AuthLayout.jsx           mobile-first zentriertes Karten-Layout
      LoginForm.jsx            E-Mail/Passwort, Fehler inkl. 403 "nicht freigeschaltet"
      RegisterForm.jsx         Name/E-Mail/Passwort + Beteiligung + Teams + Dienste
      TextField.jsx / Alert.jsx
```

## Routen & Rollen-Schutz

| Pfad           | Schutz                                        |
| -------------- | --------------------------------------------- |
| `/login`       | Öffentlich; eingeloggt → Redirect auf `/`     |
| `/`            | `<ProtectedRoute>` – jeder eingeloggte User   |
| `/admin`       | `<ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>` (admin, sub_admin, trainer) |
| `/teams/:code` | `<ProtectedRoute>` – jeder eingeloggte User; Verwaltung schaltet das Backend per `canManage` frei |
| `*`            | Redirect auf `/`                              |

> `/admin` ist für `trainer` zugänglich, damit sie die Mannschaftszuordnung
> pflegen können. Rollen- und Freigabe-Steuerelemente rendert `AdminPage` nur
> für admin/sub_admin; das Backend lehnt entsprechende Felder ohnehin ab.

### Sub-Admin in der Oberfläche

- Dashboard zeigt das Badge **SUB-ADMIN**.
- In der `AdminPage` sind Zeilen von Konten mit der Rolle `admin` als
  „gesperrt“ markiert: Rollen-Select, Team-Chips und Freischalten-Button sind
  deaktiviert.
- Die Rolle „Admin“ fehlt in der Auswahlliste (die aktuelle Rolle einer Zeile
  wird trotzdem korrekt angezeigt).

## Registrierung

Das Formular fragt „Wie machst du mit?“ als Mehrfachauswahl ab:

| Auswahl        | Folge |
| -------------- | ----- |
| Spieler:in     | Mannschaftsauswahl → `relationType: 'player'` |
| Trainer:in     | Mannschaftsauswahl → `relationType: 'coach'` |
| Mitwirkende:r  | Checkboxen für Helferdienste **und** aktiviert „Zuschauer:in“ zwingend mit (nicht abwählbar, solange aktiv) |
| Zuschauer:in   | Mannschaftsauswahl → `relationType: 'fan'` |

Gesendet wird `teams: [{ teamId, relationType }]` plus `services`. Die
RBAC-Rolle setzt der Client bewusst **nicht** – sie wird bei der Freigabe vom
Admin vergeben.

`ProtectedRoute` verhält sich so:

- lädt noch → Ladeanzeige
- nicht eingeloggt → `<Navigate to="/login" />`
- Rolle nicht in `allowedRoles` → `<Navigate to="/" />`
- sonst → `children`

Die Rolle kommt aus `useAuth().role` (aus `GET /api/auth/me` bzw. der
Login-Antwort). Der Routen-Schutz ist nur UX – die eigentliche Autorisierung
macht das Backend (`checkRole`).

## Abgelaufene Sitzungen

`apiFetch()` meldet einen `401` (bzw. `403` auf `/api/auth/me`) an den
`AuthProvider`. Der setzt `user` auf `null`, woraufhin `ProtectedRoute`
automatisch auf `/login` umleitet – inklusive Merken des ursprünglichen Ziels.
Die Login-Endpunkte selbst sind ausgenommen, damit ein falsches Passwort
weiterhin als Formularfehler und nicht als Sitzungsabbruch behandelt wird.

## Auth-Fluss

1. Beim Laden fragt der `AuthProvider` `GET /api/auth/me` ab (Cookie-Check).
2. `login()` → `POST /api/auth/login`; das Backend setzt ein HttpOnly-Cookie
   (für JS nicht lesbar). Bei Erfolg wird `user` gesetzt → App zeigt das Dashboard.
3. Nicht freigeschaltete Accounts (`is_approved = 0`) erhalten HTTP 403; der
   Login-Screen zeigt dazu einen Hinweis.
4. `register()` → `POST /api/auth/register` (inkl. gewählter `teamIds`); danach
   Erfolgsmeldung mit Hinweis auf die nötige Admin-Freischaltung.
5. `logout()` → `POST /api/auth/logout` löscht das Cookie; `user` wird `null`.

`useAuth()` liefert zusätzlich `teams` (`[{ id, code, name }]`) des angemeldeten
Nutzers – befüllt aus `GET /api/auth/me` bzw. der Login-Antwort.

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
