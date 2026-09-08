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
    useNews.js                 lädt GET /api/news (+ reload nach Anlegen/Löschen)
  lib/
    api.js                     fetch-Wrapper, IMMER credentials: 'include'
                               (setzt bei FormData bewusst KEINEN Content-Type)
    roles.js                   Rollen-Konstanten, Labels und Badges
    participation.js           Beteiligungsarten, Beziehungstypen, Helferdienste
    navigation.js              EINZIGE Quelle der Hauptnavigation (rollengefiltert)
    format.js                  deutsche Datumsformate
  components/
    AppLayout.jsx              Gerüst aller geschützten Seiten:
                               Kopfzeile + MainNav + Inhalt + BottomNav
    AppHeader.jsx / Brand.jsx  Marken-Streifen, klebende Leiste, Wort-/Bildmarke
    MainNav.jsx                Kopfzeilen-Navigation ab `md`
    BottomNav.jsx              mobile Bottom-Navigation (fixiert, unter `md`)
    NavIcons.jsx               Inline-SVG-Icons der Navigation
    ScrollToTop.jsx            setzt den Scroll-Stand bei Seitenwechsel zurück
    Badge.jsx                  Badge / RoleBadge (Rollen- und Status-Chips)
    FullScreenLoader.jsx
    ErrorBoundary.jsx          fängt Render-Fehler ab (keine weisse Seite)
    ProtectedRoute.jsx         Routen-Schutz nach Login-Status + Rolle
    TeamSelect.jsx             Mannschafts-Mehrfachauswahl als Toggle-Chips
    MyTeams.jsx                eigene Mannschaften, nach Beziehung gruppiert
                               (Dashboard + Mannschafts-Übersicht)
    NewsCard.jsx               eine Ankündigung (Datum, Titel, Bild, Text)
    NewsManager.jsx            Verwaltung der News: Formular + Liste + Löschen
    Dashboard.jsx              /: News-Feed, „Meine Mannschaften“, Konto
    TeamsPage.jsx              /teams: eigene + alle Mannschaften
    SchedulePage.jsx           /termine: Vorschau auf das Termin-Modul
    AdminPage.jsx              /admin: Mitgliederliste + News-Verwaltung
    TeamPage.jsx               /teams/:code: offene Beitrittsanfragen + Kader
    auth/
      AuthScreen.jsx           Umschalter Login <-> Registrierung
      AuthLayout.jsx           mobile-first zentriertes Karten-Layout
      LoginForm.jsx            E-Mail/Passwort
      RegisterForm.jsx         Name/E-Mail/Passwort + Beteiligung + Teams + Dienste
      TextField.jsx / Alert.jsx
```

## Navigation

`lib/navigation.js` definiert die Reiter **einmal**; `BottomNav` (mobil,
fixiert am unteren Rand) und `MainNav` (ab `md` in der Kopfzeile) rendern
dieselbe Liste – sie können also nicht auseinanderlaufen.

| Reiter | Pfad | Sichtbar für |
| ------ | ---- | ------------ |
| Start | `/` | alle |
| Teams | `/teams` | alle |
| Termine | `/termine` | alle |
| Verwaltung | `/admin` | `admin`, `sub_admin`, `trainer` |

Alle Ziele sind zusätzlich per `<ProtectedRoute>` und im Backend abgesichert –
das Ausblenden eines Reiters ist reine UX. `AppLayout` setzt unten
`pb-bottom-nav` (80 px + Safe-Area), damit die Leiste nichts verdeckt;
Touch-Ziele sind 56 px hoch.

## Routen & Rollen-Schutz

| Pfad           | Schutz                                        |
| -------------- | --------------------------------------------- |
| `/login`       | Öffentlich; eingeloggt → Redirect auf `/`     |
| `/`            | `<ProtectedRoute>` – jeder eingeloggte User   |
| `/teams`       | `<ProtectedRoute>` – Übersicht aller Mannschaften |
| `/teams/:code` | `<ProtectedRoute>` – jeder eingeloggte User; Verwaltung schaltet das Backend per `canManage` frei |
| `/termine`     | `<ProtectedRoute>` – Vorschau auf das Termin-Modul |
| `/admin`       | `<ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>` (admin, sub_admin, trainer) |
| `*`            | Redirect auf `/`                              |

> `/admin` ist für `trainer` zugänglich, damit sie die Mannschaftszuordnung
> pflegen können. Rollen-Steuerelemente rendert `AdminPage` nur für
> admin/sub_admin; das Backend lehnt entsprechende Felder ohnehin ab.
> Dasselbe gilt für die News-Verwaltung: `AdminPage` blendet sie für
> Trainer:innen aus, `POST/DELETE /api/admin/news` antwortet ihnen mit `403`.

## Vereins-News

- **Lesen:** `useNews()` → `GET /api/news`. Das Dashboard zeigt die neuesten
  fünf Beiträge, „Ältere Beiträge anzeigen“ lädt den Rest nach.
- **Verwalten:** `NewsManager` (nur `admin`/`sub_admin`) sendet
  `multipart/form-data` an `POST /api/admin/news`. Bilder werden vor dem
  Upload im Browser auf 5 MB geprüft und als Vorschau angezeigt; gelöscht wird
  zweistufig („Löschen“ → „Wirklich löschen“).
- Beitragstext wird als **Text** gerendert (`white-space: pre-line`), niemals
  als HTML – Zeilenumbrüche bleiben erhalten, HTML-Injektion ist ausgeschlossen.

### Sub-Admin in der Oberfläche

- Dashboard zeigt das Badge **SUB-ADMIN**.
- In der `AdminPage` sind Zeilen von Konten mit der Rolle `admin` als
  „gesperrt“ markiert: Rollen-Select und Team-Chips sind deaktiviert.
- Die Rolle „Admin“ fehlt in der Auswahlliste (die aktuelle Rolle einer Zeile
  wird trotzdem korrekt angezeigt).

## Registrierung & Team-Bestätigung

Das Formular fragt „Wie machst du mit?“ als Mehrfachauswahl ab:

| Auswahl        | Folge |
| -------------- | ----- |
| Spieler:in     | Mannschaftsauswahl → `relationType: 'player'` (Beitritt muss der Trainer bestätigen) |
| Trainer:in     | Mannschaftsauswahl → `relationType: 'coach'` (Beitritt muss der Trainer bestätigen) |
| Mitwirkende:r  | Checkboxen für Helferdienste **und** aktiviert „Zuschauer:in“ zwingend mit |
| Zuschauer:in   | Mannschaftsauswahl → `relationType: 'fan'` (sofort aktiv) |

Gesendet wird `teams: [{ teamId, relationType }]` plus `services`. Die
RBAC-Rolle setzt der Client bewusst **nicht**.

**Es gibt keine globale Admin-Freigabe mehr** – das Konto ist nach der
Registrierung sofort aktiv und der Login funktioniert direkt. Stattdessen:

- Das Dashboard zeigt Mannschaften mit `isConfirmed === false` als
  „ausstehend“.
- Auf `/teams/:code` sehen Verwaltende ganz oben „Offene Beitrittsanfragen“
  mit **Bestätigen** (`POST …/members/:id/confirm`) und **Ablehnen**
  (`DELETE …/members/:id`).
- Der öffentliche Kader (`members`) enthält nur bestätigte Mitglieder.

`ProtectedRoute` verhält sich so:

- lädt noch → Ladeanzeige
- nicht eingeloggt → `<Navigate to="/login" />`
- Rolle nicht in `allowedRoles` → `<Navigate to="/" />`
- sonst → `children`

Die Rolle kommt aus `useAuth().role` (aus `GET /api/auth/me` bzw. der
Login-Antwort). Der Routen-Schutz ist nur UX – die eigentliche Autorisierung
macht das Backend (`checkRole`).

## Abgelaufene Sitzungen

`apiFetch()` meldet einen `401` an den `AuthProvider`. Der setzt `user` auf
`null`, woraufhin `ProtectedRoute` automatisch auf `/login` umleitet –
inklusive Merken des ursprünglichen Ziels. Die Login-Endpunkte selbst sind
ausgenommen, damit ein falsches Passwort weiterhin als Formularfehler und
nicht als Sitzungsabbruch behandelt wird.

## Auth-Fluss

1. Beim Laden fragt der `AuthProvider` `GET /api/auth/me` ab (Cookie-Check).
2. `login()` → `POST /api/auth/login`; das Backend setzt ein HttpOnly-Cookie
   (für JS nicht lesbar). Bei Erfolg wird `user` gesetzt → App zeigt das Dashboard.
   Es gibt **keine** Freigabe-Hürde: neue Konten können sich sofort anmelden.
3. `register()` → `POST /api/auth/register` (inkl. `teams` / `services`); danach
   Erfolgsmeldung „Konto sofort aktiv, Team-Zuordnungen bestätigt der Trainer“.
4. `logout()` → `POST /api/auth/logout` löscht das Cookie; `user` wird `null`.

`useAuth()` liefert zusätzlich `teams`
(`[{ id, code, name, relationType, isConfirmed }]`) und `services` des
angemeldeten Nutzers – befüllt aus `GET /api/auth/me` bzw. der Login-Antwort.

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
