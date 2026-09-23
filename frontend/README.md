# Frontend – HSG Hinterland App

React (Vite) + Tailwind CSS v4 + React Router + PWA. Authentifizierungs-UI mit
React Context und rollenbasiertem Routen-Schutz (RBAC).

Zwei Laufzeit-Abhängigkeiten über React hinaus:

| Paket | Wofür | Wo |
| ----- | ----- | -- |
| `lucide-react` | Icons der Verwaltung (Baumstruktur-Import, es landet nur im Bündel, was benutzt wird) | `components/admin/**` |
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
  main.jsx                     <BrowserRouter> + <AuthProvider>
  App.jsx                      <Routes>: /login, / (geschützt), /admin (admin+trainer), * -> /
  context/
    AuthContext.jsx            globaler Auth-State: user, role, teams, loading, error
                               + login() / register(…, teamIds) / logout() / refresh()
                               prüft beim Start GET /api/auth/me
  hooks/
    useTeams.js                lädt GET /api/teams (öffentlich)
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
    participation.js           Beteiligungsarten, Beziehungstypen, Helferdienste
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
    Badge.jsx                  Badge / RoleBadge (Rollen- und Status-Chips)
    Modal.jsx                  Rückfrage-Dialog über dem Inhalt (fixiert)
    FullScreenLoader.jsx
    ErrorBoundary.jsx          fängt Render-Fehler ab (keine weisse Seite)
    ProtectedRoute.jsx         Routen-Schutz nach Login-Status + Rolle
    TeamSelect.jsx             Mannschafts-Mehrfachauswahl als Toggle-Chips
    MyTeams.jsx                eigene Mannschaften, nach Beziehung gruppiert
                               (Dashboard + Mannschafts-Übersicht)
    NewsCard.jsx               eine Ankündigung (Datum, Titel, Bild, Text)
    Dashboard.jsx              /: News-Feed, „Meine Mannschaften“, Konto
    TeamsPage.jsx              /teams: eigene + alle Mannschaften
    SchedulePage.jsx           /termine: Vorschau auf das Termin-Modul
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
      ui/                      StatCard, Modal, Pagination, SearchField,
                               Feedback (Loading/Error/Success/EmptyState)
      charts/                  chartTheme.js (Farben & Achsen) + TrafficChart,
                               LatencyChart, CountryChart, StatusBreakdown
    CalendarPage.jsx           /kalender: Kalender-Modul mit Reitern
    AdminPage.jsx              /admin: Mitgliederliste + News-Verwaltung
    TeamPage.jsx               /teams/:code: Fan-Mannschaftsseite mit Reitern
                               (Übersicht / Spielplan & Tabelle / Kader /
                               Verwaltung), Live-Banner und nuLiga-Widgets
    team/
      TeamHero.jsx             Kopfbereich: Foto/Verlauf, Name, Liga
      NextGameCard.jsx         Karte „Nächstes Spiel" (Reiter Übersicht)
      RosterSection.jsx        Kader: Trainerstab, Spielerkarten, Positionsfilter
      TeamManagePanel.jsx      Verwaltung: Anfragen, Zuordnungen, Stammdaten
      Skeleton.jsx             Lade-Platzhalter
    schedule/
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
      RegisterForm.jsx         Name/E-Mail/Passwort + Beteiligung + Teams + Dienste
      TextField.jsx / Alert.jsx
```

## Mannschaftsseite (`/teams/:code`)

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
| **Anstehend** | alle | Terminliste nach Datum, nach Monat gruppiert. Filter nach Mannschaft und nach Kategorie (Training / Spiele / Sonstiges) sowie „Rückblick 30 Tage" |
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
