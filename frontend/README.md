# Frontend – HSG Hinterland App

React (Vite) + Tailwind CSS v4 + React Router + PWA. Authentifizierungs-UI mit
React Context und rollenbasiertem Routen-Schutz (RBAC).

Zwei Laufzeit-Abhängigkeiten über React hinaus:

| Paket | Wofür | Wo |
| ----- | ----- | -- |
| `lucide-react` | Icons in Verwaltung, Startseite, Onboarding und Dialogen (Baumstruktur-Import, es landet nur im Bündel, was benutzt wird) | `components/**` |
| `recharts` | Diagramme des System-Status | nur im nachgeladenen Teilstück `SystemSection` – siehe [Verwaltung](#verwaltung-admin) |

Die Navigations-Icons der App selbst bleiben handgeschriebenes Inline-SVG
(`NavIcons.jsx`) – sie sind Teil des Erscheinungsbilds und sollen nicht von
einer Bibliothek abhängen.

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
  main.jsx                     <BrowserRouter> + <AuthProvider> + <ThemeProvider>
  App.jsx                      <Routes>: /login, /willkommen (Onboarding),
                               / (geschützt), /admin (admin+trainer), * -> /
  context/
    AuthContext.jsx            globaler Auth-State: user, role, teams, services,
                               needsOnboarding, loading, error + login() /
                               register() / logout() / refresh() /
                               completeOnboarding() / updatePreferences() /
                               changePassword(); prüft beim Start GET /api/auth/me
    ThemeContext.jsx           Hell/Dunkel: leitet die Einstellung aus Sitzung,
                               Profil und localStorage ab und setzt die Klasse
                               `dark` am <html> (siehe „Design")
  hooks/
    useTeams.js                lädt GET /api/teams (Anmeldung nötig)
    useNews.js                 lädt GET /api/news (+ reload nach Anlegen/Löschen)
    useAdminUsers.js           seitenweise Mitgliederliste (entprellte Suche,
                               verwirft überholte Antworten) + useMemberStats
    useAdminNews.js            Verwaltungssicht der News inkl. Archiv
    useAdminTeams.js           Mannschaften mit Mitgliederzahlen
    useSystemStatus.js         System-Status, frischt alle 15 s auf
                               (pausiert im Hintergrund-Tab)
    useHandball.js             useHandballTable / useHandballSchedule /
                               useLiveTicker (Polling im 10-Sekunden-Takt)
                               Quelle: nuLiga (HHV), siehe backend/README.md
    useSchedule.js             useEvents / useAbsences / useEventSeries /
                               useAttendanceHistory (Termin-Modul)
  lib/
    api.js                     fetch-Wrapper, IMMER credentials: 'include'
                               (setzt bei FormData bewusst KEINEN Content-Type)
    roles.js                   Rollen-Konstanten, Labels und Badges
    participation.js           Beteiligungsarten (die drei Fragen des
                               Onboardings), Beziehungstypen, Helferdienste
    teams.js                   Einteilung der Mannschaften (Senioren/Jugend),
                               Beschriftungen und der Bildausschnitt des
                               Kopfbereichs (photoFrameStyle)
    theme.js                   Werte des Themas + die drei Browser-Zugriffe
                               (localStorage, Media Query, Adressleisten-Farbe)
    navigation.js              EINZIGE Quelle der Hauptnavigation (rollengefiltert)
    format.js                  deutsche Datums-, Zahlen- und Größenformate
                               (formatBytes / formatDuration / formatMs / …)
    handball.js                Beschriftungen, Ergebnis-/Zeitformate und
                               Ereignis-Symbole des Handball-Moduls
    schedule.js                Terminarten, Kategorien, Status-Farben und
                               Datums-/Zeitformate des Kalenders
  components/
    AppLayout.jsx              Gerüst aller geschützten Seiten:
                               Kopfzeile + MainNav + Inhalt + BottomNav
    AppHeader.jsx / Brand.jsx  Marken-Streifen, klebende Leiste, Wort-/Bildmarke
    MainNav.jsx                Kopfzeilen-Navigation ab `md`
    BottomNav.jsx              mobile Bottom-Navigation (fixiert, unter `md`)
    NavIcons.jsx               Inline-SVG-Icons der Navigation
    ScrollToTop.jsx            setzt den Scroll-Stand bei Seitenwechsel zurück
    Badge.jsx                  Badge (Status-Chips; die Rolle einer Person
                               steht bewusst nirgends im Kopfbereich)
    ThemeChoice.jsx            Auswahl Hell/Dunkel/System (Onboarding + Konto)
    ui/                        geteilte Bausteine: Modal.jsx (DER Dialog der
                               App), StatCard.jsx (Kennzahl-Kachel),
                               Avatar.jsx (Profilbild, sonst Initialen)
    FullScreenLoader.jsx
    ErrorBoundary.jsx          fängt Render-Fehler ab (keine weisse Seite)
    ProtectedRoute.jsx         Routen-Schutz nach Login-Status, Rolle und
                               offenem Onboarding
    TeamSelect.jsx             Mannschafts-Mehrfachauswahl als Toggle-Chips
                               (Verwaltung – dort sind die Kürzel bekannt)
    MyTeams.jsx                eigene Mannschaften, nach eigener Rolle gruppiert
                               (Startseite + Mannschafts-Übersicht)
    NewsCard.jsx               eine Ankündigung (Datum, Titel, Bilder, Text);
                               `highlight` macht sie zum Aufmacher
    Dashboard.jsx              /: Aktuelles, Mannschaften + „Als Nächstes",
                               „Mein Konto", Verwaltungs-Einstieg
    dashboard/
      NextUpPanel.jsx          die nächsten Trainings und Spiele als Kurzliste
    onboarding/
      OnboardingWizard.jsx     Einrichtung nach der Registrierung (vier
                               Schritte: Rolle, Mannschaften, Profil, Design)
      TeamChoice.jsx           Mannschaftsauswahl als Karten, nach Senioren /
                               Jugend gruppiert (Onboarding + „Mein Konto")
    account/
      AccountPanel.jsx         „Mein Konto": Kennzahlen + vier Bereiche
      ProfileForm.jsx          Profilbild und Telefonnummer (auch im Onboarding)
      PreferencesForm.jsx      Rolle & Mannschaften nachträglich ändern
      PasswordForm.jsx         Passwortwechsel (aktuelles Passwort nötig)
    TeamsPage.jsx              /teams: zwei Reiter („Meine" / „Alle") mit
                               denselben Karten, gruppiert nach eigener Rolle
                               bzw. nach Senioren / Jugend
    AdminPage.jsx              /admin: Gerüst der Verwaltung – Reiterleiste
                               (wie TeamPage) + genau EIN Bereich
    admin/
      MembersSection.jsx       Mitglieder: Kennzahlen, Suche, Rollen-/Status-
                               Filter, Tabelle, Seitenschaltung
      NewsSection.jsx          News: Umschalter „Aktiv“/„Archiv“, Dialog zum
                               Veröffentlichen (beliebig viele Bilder),
                               Archivieren, Zurückholen, Löschen mit Rückfrage
      TeamsSection.jsx         Mannschaften: Stammdaten-Tabelle mit klickbaren
                               Zellen (nuLiga -> bearbeiten, Kader -> Kader-
                               verwaltung) + Dialoge zum Anlegen und Ändern
      SystemSection.jsx        System-Status: Hardware-Messer, API-Kennzahlen,
                               Diagramme, Herkunft, Wartungsaktionen
      ui/                      Pagination, SearchField, Feedback
                               (Loading/Error/Success/EmptyState)
      charts/                  chartTheme.js (Farben & Achsen) + TrafficChart,
                               LatencyChart, CountryChart, StatusBreakdown
    CalendarPage.jsx           /kalender: Kalender-Modul mit Reitern
    AdminPage.jsx              /admin: Mitgliederliste + News-Verwaltung
    TeamPage.jsx               /teams/:code: Fan-Mannschaftsseite mit Reitern
                               (Übersicht / Spielplan & Tabelle / Kader /
                               Verwaltung), Live-Banner und nuLiga-Widgets
    team/
      TeamHero.jsx             Kopfbereich: Foto/Verlauf, Name, Liga
      PhotoFrameDialog.jsx     Bildausschnitt des Kopfbereichs: ziehen,
                               zoomen, Vorschau in Originaloptik
      RosterSection.jsx        Kader mit Profilbildern; Trainer:innen mit
                               E-Mail und (falls hinterlegt) Telefonnummer
      NextGameCard.jsx         Karte „Nächstes Spiel" (Reiter Übersicht)
      RosterSection.jsx        Kader: Trainerstab, Spielerkarten, Positionsfilter
      TeamManagePanel.jsx      Verwaltung: Anfragen, Zuordnungen, Stammdaten
      Skeleton.jsx             Lade-Platzhalter
    schedule/
      FilterBar.jsx            Filterleiste: Mannschaft, Terminart, Zeitraum
      UpcomingPanel.jsx        Terminliste, nach Monat gruppiert
      EventCard.jsx            ein Termin: Mannschaft, Zeit, Ort, grosser
                               Status-Balken, Abmelden, Mannschaft aufklappen
      TeamRoster.jsx           ganze Mannschaft: Da / Nicht da (+ Übersteuern)
      EventDialogs.jsx         Absagen, Löschen, Bearbeiten als Dialog
      DeclineForm.jsx          Abmeldung – Grund ist Pflicht
      EventForm.jsx            Trainingszeit oder Einzeltermin anlegen
      AbsencePanel.jsx         eigener Urlaub / eigene Verletzungen
      TeamAbsences.jsx         längerfristige Ausfälle im Kader (Trainer)
      ParticipationPanel.jsx   Beteiligung in Prozent je Person
      PlanningPanel.jsx        Planung je Mannschaft (Zeiten, nuLiga, Ausfälle)
    handball/
      TableWidget.jsx          Ligatabelle, eigene Mannschaft hervorgehoben
      ScheduleWidget.jsx       nächste Spiele + letzte Ergebnisse, Status-Badge
      LiveTickerWidget.jsx     Anzeigetafel + Ereignisse, lädt automatisch nach
    auth/
      AuthScreen.jsx           Umschalter Login <-> Registrierung
      AuthLayout.jsx           mobile-first zentriertes Karten-Layout
      LoginForm.jsx            E-Mail/Passwort
      RegisterForm.jsx         genau vier Felder: Vor-/Nachname, E-Mail,
                               Passwort – meldet direkt an
      TextField.jsx / Alert.jsx
```

## Mannschaftsseite (`/teams/:code`)

In der Kopfzeile steht links der Mannschaftsname als Weg zurück zur Übersicht –
ohne das frühere Kürzel-Abzeichen davor, das neben dem ausgeschriebenen Namen
nichts hinzufügte.

Vier Reiter, damit die Seite nicht überläuft. Der aktive Reiter steht im
Adressfeld (`?tab=kader`) – ein Link auf den Kader geht auch als Kader wieder
auf, und der Zurück-Knopf des Browsers tut, was er soll. Der Reiter
„Verwaltung" erscheint nur für Trainer:innen dieser Mannschaft und Admins.

| Reiter | Inhalt |
| ------ | ------ |
| Übersicht | genau zwei Dinge: die Karte „Nächstes Spiel" und die Ligatabelle |
| Spielplan & Tabelle | Umschalter „Nächste Spiele / Ergebnisse / Gesamter Spielplan" plus Ligatabelle |
| Kader | Trainer-/Betreuerstab und Spielerkarten mit Positionsfilter |
| Verwaltung | offene Beitrittsanfragen, Zuordnungen, Stammdaten (nur Admin) |

Darüber – über allen Reitern – erscheint der **Live-Ticker-Banner**, sobald für
die Mannschaft ein Spiel läuft. Wer die App am Spieltag öffnet, sucht genau
das. Existiert für das laufende Spiel noch kein nuLiga-Spielbericht, zeigt der
Banner die Begegnung mit einem Hinweis statt eines leeren Tickers.

Weitere Entscheidungen, die beim Weiterbauen wichtig sind:

* **Die Übersicht bleibt bei zwei Elementen.** Spielplan-Listen, vergangene
  Ergebnisse und Match-Details gehören ausschließlich in „Spielplan & Tabelle".
  Wer die Übersicht erweitern will, erweitert stattdessen den anderen Reiter.
* **Der Kopfbereich trägt nur die Identität** der Mannschaft: Foto, Name, Liga.
  Kürzel, Rollen-Badge und Kaderzahlen stehen dort bewusst nicht – das Kürzel
  zeigt schon die Kopfzeile, Zahlen gehören in die Reiter.
* **Der Bildausschnitt ist einstellbar.** Nach dem Hochladen eines Fotos öffnet
  sich `PhotoFrameDialog`: ziehen, zoomen, Vorschau in Originaloptik. Gespeichert
  werden drei Prozentwerte (`PATCH /api/teams/:code/photo/frame`), kein
  zugeschnittenes Bild – das Original bleibt erhalten, der Ausschnitt lässt sich
  jederzeit korrigieren, und Handy wie Rechner schneiden keine Köpfe ab.
* **Ohne Foto** trägt der Kopfbereich einen Verlauf im Anthrazit der Marke mit
  grünem Schimmer (`.team-hero` in `index.css`), keine fremde Farbfamilie.
* **Ohne `handballTeamId`** erscheint statt Tabelle und Spielplan der Hinweis
  „Ligaspiele für diese Saison noch nicht terminiert.". Für Verwaltende steht
  dabei, wo sich die Nummer eintragen lässt.
* **Der Positionsfilter erscheint nur, wenn er etwas bringt** (mindestens zwei
  verschiedene Positionen im Kader).
* **Profilbilder gibt es noch nicht.** Die Karte zeigt die Rückennummer im
  Trikot-Kreis, ersatzweise die Initialen.

## Kalender (`/kalender`)

Trainingszeiten, Ligaspiele, Sondertermine und Anwesenheiten – das Gegenstück
zu `backend/README.md` → „Kalender".

**Eine Seite, zwei Rollen.** Welche Reiter erscheinen, entscheidet nicht die
globale Rolle, sondern die Mannschaftsbeziehung, die das Backend mit der
Terminliste zurückgibt (`teams: [{ id, code, name, canManage, isPlayer, … }]`):

| Reiter | sichtbar für | Inhalt |
| ------ | ------------ | ------ |
| **Anstehend** | alle | Terminliste nach Datum, nach Monat gruppiert. Darüber eine Filterleiste (`FilterBar`) mit drei benannten Feldern: **Mannschaft** („Alle meine Teams" oder eine bestimmte, als Auswahlfeld), **Terminart** (Alles / Training / Spiele / Sonstiges als Segmentumschalter) und **Zeitraum** (Nur anstehende / Rückblick 30 Tage / eigener Zeitraum mit
zwei Datumsfeldern, die erst beim Auswählen erscheinen). Vorher waren das bis zu zwölf gleich aussehende Chips in zwei Reihen, von denen einer nicht filterte, sondern den Zeitraum verschob |
| **Meine Abwesenheiten** | wer irgendwo `player` ist | Urlaub/Verletzung mit Zeitraum eintragen und entfernen |
| **Beteiligung** | alle | Zeitraum + Kategorie, dann je Person der Anteil in Prozent. Ein Klick öffnet die Termine dahinter. **Jedes Mitglied** sieht die ganze Mannschaft, nicht nur das Trainerteam; die eigene Zeile ist grün hinterlegt |
| **Planung** | wer irgendwo `coach` ist (oder Admin) | **Erst die Mannschaft wählen**, dann Trainingszeiten, Einzeltermine, Ligaspiele aus nuLiga und längerfristige Ausfälle für genau diese Mannschaft |

**Die Terminkarte** beantwortet von oben nach unten drei Fragen, in genau
dieser Reihenfolge:

1. **Was und wann?** Datumsblock, Titel und eine Zeile
   `Mannschaft · Uhrzeit · Halle`. Die Mannschaft steht bewusst dort und nicht
   als Kürzel in der Ecke – wer in zwei Mannschaften spielt oder eine
   trainiert und in einer anderen spielt, muss auf einen Blick sehen, um
   wessen Training es geht. Eine Art-Kennzeichnung erscheint nur, wo sie etwas
   hinzufügt (Spiel, Sondertermin); bei einem Training stünde sonst dreimal
   „Training" auf derselben Karte.
2. **Bin ich dabei?** Ein breiter farbiger Balken (`.attend-bar`) mit
   „Du bist dabei" / „Du bist abgemeldet" / „Du bist nicht da". Das ist die
   Frage, wegen der die meisten die App überhaupt öffnen – deshalb Fläche
   statt Chip.
3. **Wer sonst?** Ein kleiner Knopf mit Personen-Symbol und Zählung
   („14 von 16"). Ein Klick klappt `TeamRoster` auf: die ganze Mannschaft,
   geteilt in **Da** und **Nicht da**.

**Abgesagte Termine** tragen eine rote Fläche über der ganzen Karte
(`.event-cancelled`) samt Grund, der Titel ist durchgestrichen. Das muss man
beim Überfliegen der Liste sehen, ohne zu lesen. Der Termin bleibt stehen –
wer nicht in die App schaut, stünde sonst vor der Halle.

**Zu- und Absagen.** Es gibt **keinen** „Ich bin dabei"-Knopf: Zusagen ist der
Standard, da ist nichts zu bestätigen. Angeboten wird nur „Abmelden" – und wer
abgesagt hat, findet dort „Doch dabei" und „Grund ändern". Ohne Grund lässt
sich nicht absenden (das Backend weist es zusätzlich ab).

**Farben.**

| | Bedeutung |
| --- | --- |
| Grün (`.badge-confirmed`) | dabei |
| Rot (`.badge-declined`) | abgesagt |
| Gelb (`.badge-pending`) | Urlaub / Verletzung |

Zwischen „hat zugesagt" und „hat nichts gesagt" wird nicht unterschieden –
beides zählt gleich, und zwei Grüntöne hätten nur Fragen aufgeworfen.

**Sichtbarkeit der Gründe.** Wer fehlt, sehen immer alle. Warum jemand fehlt,
nur das Trainerteam – es sei denn, beim Termin ist „Abmeldegründe für alle
sichtbar" gesetzt. Gefiltert wird im **Backend**: Der Grund wird gar nicht
erst ausgeliefert. In der Liste steht dann schlicht der Name, ohne Hinweis
darauf, dass es einen Grund gibt.

**Ligaspiele.** Ist im Planungsbereich „Ligaspiele aus nuLiga" eingeschaltet,
stehen die Spiele als normale Termine im Kalender – mit Abmeldung,
Kaderübersicht und eigener Beteiligungsquote. Bearbeiten und Löschen sind
gesperrt: Der nächste Abgleich würde die Änderung überschreiben. Absagen geht
trotzdem, denn das ist eine Information der Mannschaft, nicht des Verbands.

**Rückfragen sind echte Dialoge** (`components/Modal.jsx`), keine Kästen am
Seitenanfang: Wer weit unten in einer langen Liste auf „Löschen" tippt, sieht
einen Kasten ganz oben nicht – die Aktion wirkte dann, als sei nichts
passiert. Der Dialog liegt fixiert über der Seite, auf dem Handy von unten
eingeblendet, und schließt per Escape oder Klick auf die Abdunklung.

**Zeitzonen.** Termine kommen als `JJJJ-MM-TTTHH:MM:SS` ohne Zeitzone an und
werden von `new Date()` als Ortszeit gelesen – 19:00 Uhr bleibt 19:00 Uhr.
Reine Datumsangaben (`JJJJ-MM-TT`, z. B. Urlaubsspannen) laufen **nicht** durch
`Date`: Die würde sie als UTC lesen und den 1. Juli westlich von Greenwich zum
30. Juni machen. Dafür gibt es `formatIsoDate()` in `lib/schedule.js`.

## Handball-Widgets

Drei Widgets zeigen die Verbandsdaten aus `/api/handball/*` (Quelle ist das
nuLiga-Portal des HHV; Details: `backend/README.md`). Alle drei brauchen nur
eine ID – die Mannschafts-ID ist nuLigas `teamtable`-Nummer, die Spiel-ID
stammt unverändert aus dem Spielplan:

```jsx
<TableWidget teamId={teamId} />              // Ligatabelle
<ScheduleWidget teamId={teamId} />           // Spielplan + Ergebnisse
<LiveTickerWidget gameId={gameId} />         // laufendes Spiel
```

Wissenswertes für den Einbau:

* **Kein Absturz bei Ausfall.** Das Backend antwortet auch dann mit HTTP 200
  und einem gültigen DTO. Die Widgets lesen `meta` und zeigen entweder den
  Zeitstempel („Stand 14:25 Uhr"), ein Badge „Nicht aktuell" oder einen
  Hinweistext.
* **Spiele ohne Ticker-Link.** Künftige Partien haben in nuLiga noch keine
  Spiel-ID; `ScheduleWidget` macht solche Zeilen dann nicht anklickbar.
* **Sparsames Polling.** `useLiveTicker` fragt nur ein *laufendes* Spiel alle
  10 Sekunden ab, pausiert im Hintergrund (`visibilitychange`), hört nach dem
  Schlusspfiff ganz auf und streckt den Takt nach Fehlern.
* **Restzeit ist gerechnet, keine Uhr.** nuLiga liefert nur die Spielzeit
  der letzten gemeldeten Aktion. Das Ticker-Widget schreibt das ausdrücklich
  dazu. Für Jugendspiele die Spieldauer mitgeben:
  `<LiveTickerWidget gameId={id} durationMinutes={50} />`.
* **Spalten nach Wichtigkeit.** Die Tabelle zeigt auf dem Handy Rang,
  Mannschaft, Spiele und Punkte; S/U/N, Tordifferenz und Tore kommen ab `sm`
  bzw. `md` dazu.

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
| `/kalender`    | `<ProtectedRoute>` – jeder eingeloggte User; welche Reiter erscheinen, richtet sich nach der Mannschaftsbeziehung (siehe „Kalender") |
| `/termine`     | Weiterleitung auf `/kalender` (alter Pfad aus der Vorschau-Version) |
| `/admin`       | `<ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>` (admin, sub_admin, trainer) |
| `*`            | Redirect auf `/`                              |

> `/admin` ist für `trainer` zugänglich, damit sie die Mannschaftszuordnung
> pflegen können. Rollen-Steuerelemente rendert `MembersSection` nur für
> admin/sub_admin; das Backend lehnt entsprechende Felder ohnehin ab.
> Die Bereiche **News**, **Mannschaften** und **System-Status** blendet
> `AdminPage` für Trainer:innen komplett aus (`adminOnly`); die zugehörigen
> Endpunkte antworten ihnen ohnehin mit `403`.

## Verwaltung (`/admin`)

Die Seite ist ein Gerüst mit vier Bereichen, von denen immer nur **einer**
gerendert wird. Alle vier stehen als Daten in einer Liste in `AdminPage.jsx` –
Reiterleiste und Inhaltsauswahl speisen sich daraus, ein Bereich kann also
nicht in der Navigation auftauchen, den es nicht gibt.

Die Reiterleiste benutzt **dieselben Klassen wie die Mannschaftsseite**
(`.tabs` / `.tab` / `.tab--active` aus `index.css`), dieselben ARIA-Rollen und
dasselbe `replace`-Verhalten beim Umschalten. Es gibt bewusst kein eigenes
Navigationsmuster für die Verwaltung: Reiter sehen in der ganzen App gleich
aus.

| Bereich | Wer | Inhalt |
| ------- | --- | ------ |
| Mitglieder | admin, sub_admin, trainer | Kennzahlen, Suche, Filter, Tabelle, Seitenschaltung |
| News | admin, sub_admin | Aktive Beiträge und Archiv |
| Mannschaften | admin, sub_admin | Stammdaten + „Neue Mannschaft anlegen“ |
| System-Status | admin, sub_admin | Auslastung, Verkehr, Wartung |

Der gewählte Bereich steht in der Adresse (`/admin?bereich=news`): so lässt
sich ein Bereich verlinken und der Zurück-Knopf tut das Erwartbare. Ein
unbekannter oder für die Rolle unerlaubter Wert fällt still auf den ersten
Bereich zurück.

**Nachgeladen statt mitgeliefert.** Die vier Bereiche hängen an `React.lazy`.
Das ist hier kein vorsorgliches Feintuning: der System-Status bringt `recharts`
mit, rund 130 kB gepackt. Läge die Bibliothek im Hauptbündel, müsste jedes
Mitglied sie beim Öffnen der App herunterladen – für eine Seite, die nur
Admins je sehen. So bleibt das Hauptbündel bei ~95 kB (gzip), und jeder
Bereich lädt seine Daten erst, wenn er geöffnet wird.

### Mitglieder bei vierstelliger Mitgliederzahl

Suche, Filter und Paginierung laufen **serverseitig**
(`GET /api/admin/users?search=&role=&status=&page=&pageSize=`). Der Browser
bekommt immer nur die 20 Zeilen, die er anzeigt. `useAdminUsers` entprellt die
Suche um 300 ms und verwirft überholte Antworten – tippt jemand schnell „mül“,
darf die Antwort auf „mü“ die Tabelle nicht mehr überschreiben.

Gesucht wird über Vor- und Nachname, die Kombination aus beiden, die E-Mail
und die **Mitgliedsnummer** (= die Konto-ID, erste Tabellenspalte).

### News auf der Startseite

- **Langer Text:** `NewsCard` klammert den Fließtext auf sechs Zeilen
  (`.news-body--collapsed`) und blendet „Mehr anzeigen" ein – aber nur, wenn
  tatsächlich etwas abgeschnitten ist. Das wird **gemessen**
  (`scrollHeight` vs. `clientHeight`), nicht an der Zeichenzahl geschätzt: ob
  sechs Zeilen voll werden, hängt von Fensterbreite, Schrift und Umbrüchen ab,
  und ein Knopf, der beim Klick nichts ändert, ist schlimmer als keiner.
  Gemessen wird nach dem Einhängen, bei Fenster-Größenänderung und wenn die
  Webfonts geladen sind. Weder `ResizeObserver` (der geklammerte Absatz hat
  eine feste Höhe, seine Box ändert sich nie) noch `requestAnimationFrame`
  (feuert in einem Hintergrund-Tab gar nicht) taugen hier als Auslöser – beides
  wurde ausprobiert und wieder verworfen.
- **Bilderstrecke:** ein Bild füllt die Breite (16:9), mehrere stehen als
  4:3-Kacheln im Raster. Höchstens sechs Kacheln; sind es mehr, trägt die
  letzte ein „+N".
- **Vollbild:** Klick auf eine Kachel öffnet `Lightbox` – Pfeiltasten und
  Knöpfe blättern (umlaufend), Escape oder Klick auf die Fläche schließt, die
  Seite dahinter scrollt nicht mit, und der Fokus kehrt danach dorthin zurück,
  wo er herkam. Auch die Bilder hinter dem „+N" sind so erreichbar.

### System-Status: was die Diagramme zeigen

- **Anfragen und Fehler je Minute** – eine Fläche (Anfragen) plus eine Linie
  (Fehler) auf **einer** Achse; beide zählen dasselbe.
- **Antwortzeit je Minute** – bewusst ein eigenes Diagramm: Millisekunden und
  Anzahlen sind verschiedene Einheiten, und eine zweite Achse im selben Bild
  lädt dazu ein, einen Zusammenhang herauszulesen, den die Daten nicht
  hergeben.
- **HTTP-Statusklassen** – Zeilen mit Punkt, Klartext, Zahl und Anteil statt
  Torte oder Stapel: Bernstein (4xx) und Rot (5xx) liegen im Farbabstand zu
  dicht beieinander, um sie aneinandergrenzen zu lassen, und der interessante
  Wert ist fast immer der kleinste (Serverfehler) – in einer Torte genau der
  unleserliche Splitter.
- **Herkunft der Anfragen** – waagerechte Balken in **einer** Farbe: Länder
  sind keine Reihen, die man auseinanderhalten muss, ihre Größe steht schon in
  der Balkenlänge. Woher das Land kommt (und warum es „Unbekannt“ sein kann),
  steht in [backend/README.md](../backend/README.md#herkunftsland-der-anfragen);
  die Oberfläche blendet den Hinweis selbst ein, wenn kein echtes Land dabei
  ist.
- **CPU, RAM, Plattenplatz** sind keine Diagramme, sondern **Messer**: ein
  einzelner Anteil an einem Maximum ist keine Datenreihe. Der Prozentwert
  steht immer als Text daneben – die Farbe (grün / bernstein ab 75 % / rot ab
  90 %) ist Zusatz, nie die einzige Information.

## Vereins-News

- **Lesen:** `useNews()` → `GET /api/news`. Das Dashboard zeigt die neuesten
  fünf Beiträge, „Ältere Beiträge anzeigen“ lädt den Rest nach.
- **Verwalten:** `admin/NewsSection.jsx` (nur `admin`/`sub_admin`) sendet
  `multipart/form-data` an `POST /api/admin/news`. Je Beitrag sind **zwei
  Bilder** möglich (alle im Feld `images`, Mehrfachauswahl); sie werden vor
  dem Upload im Browser auf 5 MB geprüft, als Kacheln angezeigt und lassen sich
  mit zwei Pfeilen umsortieren – die Reihenfolge im Formular ist die Reihenfolge
  im Beitrag. In der Liste zeigt ein zweites Blatt hinter dem Vorschaubild an,
  dass ein Beitrag mehrere Bilder trägt.
- **Eingabefelder in Dialogen:** Der Dialog (`admin/ui/Modal.jsx`) hält
  `onClose` in einem Ref und hängt seinen Effekt **nur** an `open`. Stünde
  `onClose` in der Abhängigkeitsliste, liefe der Effekt bei jedem Rendern neu
  und setzte den Fokus zurück ins erste Feld – das Textfeld verlöre nach jedem
  Buchstaben den Fokus. Die Formulare sind aus demselben Grund auf Modulebene
  definiert, nicht im Rumpf ihrer Elternkomponente.
- **Archivieren statt löschen:** Der Knopf an einem aktiven Beitrag heißt
  „Archivieren“ (`PATCH /api/admin/news/:id`, `{ isArchived: true }`). Der
  Beitrag verschwindet aus dem Feed, bleibt unter „Archiv“ erhalten und lässt
  sich mit „Zurückholen“ wieder aktiv schalten. Endgültiges Löschen gibt es
  nur im Archiv und mit Rückfrage – erst dabei wird auch das Bild frei.
- Beitragstext wird als **Text** gerendert (`white-space: pre-line`), niemals
  als HTML – Zeilenumbrüche bleiben erhalten, HTML-Injektion ist ausgeschlossen.

### Sub-Admin in der Oberfläche

- Dashboard zeigt das Badge **SUB-ADMIN**.
- In der Mitgliedertabelle sind Zeilen von Konten mit der Rolle `admin` als
  „gesperrt“ markiert: Rollen-Select und Team-Chips sind deaktiviert.
- Die Rolle „Admin“ fehlt in der Auswahlliste (die aktuelle Rolle einer Zeile
  wird trotzdem korrekt angezeigt).

## Registrierung & Onboarding

Der Weg in die App hat zwei Stationen:

| Station | Wo | Was passiert |
| ------- | -- | ------------ |
| **Registrierung** | `RegisterForm` | Vorname, Nachname, E-Mail, Passwort. Der Server legt das Konto an **und meldet an** – `register()` setzt `user` im Context, die App wechselt sofort weiter. |
| **Onboarding** | `/willkommen` | Vier Schritte: Beteiligung (Spieler:in / Trainer:in / Zuschauer:in), Mannschaften je Beteiligung, Profil (Bild + Telefon), Design. Am Ende EIN Aufruf `POST /api/auth/me/onboarding`. |

Warum das Formular geschrumpft ist: Vorher standen Beteiligung, Helferdienste
und drei Mannschaftsauswahlen direkt unter dem Passwortfeld – also an der
Stelle, an der niemand die App kennt. Wer sich anmeldet, weiß weder, welche
Mannschaften es gibt, noch was „Mitwirkende:r" bedeutet. Diese Angaben stehen
jetzt im Assistenten, mit einer Frage je Schritt und der Möglichkeit, sie
später unter „Mein Konto" zu ändern.

Es gibt **keine Freigabe durch die Verwaltung**: Zwischen „Konto erstellen" und
der fertig eingerichteten App liegt kein Warten und kein zweites
Anmeldeformular. `ProtectedRoute` leitet auf `/willkommen` um, solange
`user.onboardingCompleted` `false` ist – und merkt sich das ursprüngliche Ziel,
sodass es nach der Einrichtung dort weitergeht.

**Bestätigung durch das Trainerteam** (unverändert): Was jemand für sich selbst
wählt, ist bei `player`/`coach` eine Anfrage.

- „Meine Mannschaften" zeigt Zuordnungen mit `isConfirmed === false` als
  „ausstehend".
- Auf `/teams/:code` sehen Verwaltende ganz oben „Offene Beitrittsanfragen"
  mit **Bestätigen** (`POST …/members/:id/confirm`) und **Ablehnen**
  (`DELETE …/members/:id`).
- Der Kader (`members`) enthält nur bestätigte Mitglieder.
- Die `fan`-Zuordnung gilt sofort. Sie steuert nur, wessen Spiele jemand
  sehen will, und wird **nirgends gezählt** – weder auf der Mannschaftsseite
  noch in der Verwaltung.

## Profilbild & Kontakt

Das Profilbild wird sofort hochgeladen (`POST /api/auth/me/photo`), die
Telefonnummer ist ein normales Formularfeld. Beides steckt in einer
Komponente (`account/ProfileForm.jsx`), die an zwei Stellen erscheint: im
Onboarding-Schritt „Profil" und unter „Mein Konto".

Angezeigt wird das Bild über `<Avatar>`: auf der Startseite statt der
Initialen, im Kader auf den Spielerkarten (die Rückennummer wandert dann als
kleines Abzeichen an den Bildrand) und in der Mannschaftsverwaltung. Ohne Bild
bleibt es beim getönten Kreis mit den Initialen.

Die **Kontaktzeile im Kader** zeigt E-Mail und Telefonnummer als `mailto:`-
bzw. `tel:`-Link – am Handy ist genau das der Zweck. Wer was sieht, entscheidet
das Backend (siehe `backend/README.md` → „Wer sieht die Kontaktdaten im
Kader?"): Trainer:innen sind für die Mitglieder **ihrer** Mannschaft
erreichbar, die Daten der Spieler:innen sieht nur das Trainerteam. Das Frontend
prüft nichts – es zeigt an, was in der Antwort steht, und lässt die Zeile weg,
wenn nichts drinsteht.

## Mein Konto (Startseite, unten)

Ein eigenes Segment am Fuß der Startseite mit vier Kennzahl-Kacheln und vier
aufklappbaren Bereichen:

| Bereich | Inhalt |
| ------- | ------ |
| **Profil** | Profilbild und Telefonnummer |
| **Mannschaften** | dieselbe Auswahl wie im Onboarding. Gesendet wird die vollständige neue Wahl (`PATCH /api/auth/me/preferences`); der Server gleicht sie ab, statt neu anzulegen – Bestätigungen und Rückennummern bleiben erhalten. |
| **Design** | Hell / Dunkel / System (`PATCH /api/auth/me/preferences`) |
| **Passwort** | aktuelles Passwort + neues Passwort mit Wiederholung |

Geöffnet ist zunächst keiner: Man kommt hierher, um etwas zu ändern, nicht um
zu lesen. Das spart auch Arbeit – die Mannschaftsliste lädt erst, wenn der
Bereich „Mannschaften" wirklich aufgeklappt wird.

Ein Passwortwechsel beendet die Sitzungen auf **anderen** Geräten; dieses
Gerät bleibt angemeldet. Das Formular sagt das in seiner Erfolgsmeldung.

## Design (Hell & Dunkel)

Das Thema hängt an **einer** Klasse: `dark` am `<html>`-Element, gesetzt vom
`ThemeProvider`.

```
tailwind.config.js        Farbnamen sind Bedeutungen: paper, ink, line, surface …
      │                   und verweisen alle auf var(--c-…)
      ▼
src/index.css             :root { --c-paper: #ffffff; … }
                          .dark { --c-paper: #1a1d20; … }
```

Damit gilt der Dunkelmodus für Karten, Tabellen, Dialoge, Formulare und
Navigation, **ohne** an jeder Komponente ein `dark:`-Gegenstück zu pflegen.
`dark:` bleibt für die wenigen Stellen, an denen im Dunkeln etwas anderes gilt
als eine andere Farbe (Verlauf des Mannschafts-Kopfbereichs, aktiver Knopf im
Umschalter).

Gewählt wird das Design an genau zwei Stellen: im Onboarding und unter „Mein
Konto". Einen Ein-Klick-Umschalter in der Kopfzeile gibt es bewusst nicht mehr –
eine Einstellung, die man einmal trifft und dann selten ändert, braucht keinen
Dauerplatz auf jeder Seite.

Drei Dinge, die dabei wichtig sind:

* **Die Wahl liegt im Profil** (`users.theme`), nicht im Browser – damit ist das
  Design am Handy dasselbe wie am Rechner. Gespeichert wird sie über
  `PATCH /api/auth/me/preferences`, das das frische Profil zurückgibt: eine
  Anfrage, kein Nachladen. `localStorage` hält nur eine Kopie,
  damit die Seite nicht hell aufblitzt, solange `GET /api/auth/me` läuft; ein
  Inline-Skript in `index.html` liest sie vor dem ersten Bild.
* **Die Einstellung wird abgeleitet, nicht kopiert:** Sitzungswahl → Profil →
  lokale Kopie → `system`. Kein Effekt, der State aus State setzt.
* **„System" hört zu:** Die Media Query hängt über `useSyncExternalStore` am
  Browser, ein Wechsel der Systemeinstellung wirkt sofort.

Die Diagramme des System-Status ziehen mit: `chartTheme.js` gibt Flächen,
Linien und Schrift als `var(--c-…)` an Recharts weiter. Die Farben der
Datenreihen bleiben feste Werte – sie sind Bedeutung (grün = Menge, rot =
Fehler), nicht Gestaltung.

## Startseite (`/`)

Aufbau von oben nach unten nach der Frage, weshalb jemand die App öffnet:

1. **Aktuelles aus dem Verein** – der jüngste Beitrag als Aufmacher
   (`<NewsCard highlight>`), darunter die weiteren, dann „Ältere Beiträge".
2. **Meine Mannschaften** und **Als Nächstes** nebeneinander: die eigenen
   Zuordnungen und die nächsten vier Termine mit Datumsblock, Ort und
   Absage-Kennzeichnung. Jeder Eintrag führt in den Kalender – zu- und
   abgesagt wird dort, damit es für dieselbe Handlung nicht zwei Orte gibt.
3. **Mein Konto** (siehe oben) und, für Verwaltungsrollen, der Einstieg in
   die Verwaltung.

Die Gestaltung folgt dem System-Status: Abschnittskarten (`.panel` mit
Kopfzeile und feiner Kontur) und Kennzahl-Kacheln (`.stat-card`). Das war der
am besten ausgearbeitete Bereich der App – statt daneben eine zweite
Formensprache zu erfinden, benutzt die Startseite dieselben Bauteile. Deshalb
heißen die Klassen auch nicht mehr `.admin-card`.

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
   (für JS nicht lesbar). Bei Erfolg wird `user` gesetzt → die App zeigt die
   Startseite, oder zuerst den Onboarding-Assistenten. Ein gesperrtes Konto
   bekommt `403` mit Begründung – das Formular zeigt sie an.
3. `register()` → `POST /api/auth/register` (vier Felder). Die Antwort enthält
   Cookie **und** Profil; `user` wird direkt gesetzt, die App springt in den
   Assistenten.
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
