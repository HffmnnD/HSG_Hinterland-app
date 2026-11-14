# Dienstplan

Helferdienste (Kuchenverkauf, Kasse, Aufbau …) planen und vergeben. Admin und
Sub-Admin legen Dienstpläne an, alle angemeldeten Mitglieder können Dienste
übernehmen. In der App: Reiter „Kalender“ → „Dienste“.

## Einrichten

1. `cd backend && npm install && npm run migrate` (Migration 017)
2. Backend neu starten

**Wichtig:** Ohne Migration 017 fehlen die Dienst-Tabellen. Beim Start meldet
das Backend dann `Dienstplan: Migration 017 fehlt …`.

## Regeln

| Was | Regel |
|---|---|
| Wer legt an | `admin`, `sub_admin` |
| Wer übernimmt | alle angemeldeten Mitglieder (je Dienst-Art einstellbar, siehe unten) |
| Plätze | 1 bis 50 Personen je Dienst |
| Gleichzeitig | niemand hat zwei Dienste, die sich zeitlich überschneiden |
| Austragen | nur über die Vereinsleitung (Admin / Hauptuser); selbst austragen gibt es seit Migration 035 nicht mehr |
| Sichtbar | Namen der Eingetragenen sehen alle Angemeldeten; Entwürfe nur die Verwaltung |
| Push beim Veröffentlichen | nur mit Haken „Helfer per Push benachrichtigen“, an alle aktiven Konten, die die Dienst-Art übernehmen dürfen (abschaltbar in den Push-Einstellungen) |
| Erinnerung | vor dem eigenen Dienst, Vorlauf in den Push-Einstellungen (3 Std., Vortag, 2 Tage, 1 Woche) |


## Gleichzeitige Zusagen

Viele tippen gleichzeitig auf „Übernehmen“? Entschieden wird allein in der
Datenbank, in einer Transaktion:

1. Konto-Zeile sperren (`users … FOR UPDATE`): Zusagen derselben Person laufen
   nacheinander, so entsteht keine Überschneidung.
2. Dienst-Zeile sperren (`duties … FOR UPDATE`): Zusagen auf denselben Dienst
   laufen nacheinander.
3. Belegte Plätze zählen, dann eintragen. Ist der Dienst voll, kommt
   `409 „Dieser Dienst ist bereits vergeben.“`.

Der Primärschlüssel `(duty_id, user_id)` verhindert doppelte Einträge auch bei
Doppelklick. `READ COMMITTED` sorgt dafür, dass nach der Sperre der neueste
Stand gezählt wird. Deadlocks werden bis zu dreimal wiederholt.

Die App schickt die Uhrzeit des Tippens mit (`clientTime`). Sie wird nur
gespeichert (`duty_assignments.client_time`), entscheidet aber nichts: Die Uhr
eines Handys kann falsch gehen.

Beim Verschieben eines Dienstes sperrt der Server die Eingetragenen in derselben
Reihenfolge und lehnt mit 409 ab, wenn jemand zur neuen Zeit schon einen Dienst
hat.

## Stresstest

```
npm run stresstest                     10.000 Konten, bis zu 1000 Anfragen gleichzeitig (Windows 300)
npm run stresstest -- --users 20000    mehr Konten
npm run stresstest -- --burst 2000     mehr gleichzeitig
npm run stresstest -- --keep           Testdatenbank danach behalten
```

Legt eine eigene Datenbank `<DB_NAME>_stresstest` an (die echte bleibt
unberührt), startet das Backend auf Port 5099 dagegen, spielt elf Szenarien
durch und schreibt `backend/stresstest-ergebnis.md`. MySQL muss laufen.

## Neue Dienst-Arten

Alles steht in `categories.js`. Eine neue Art ist ein Eintrag, zum Beispiel
Zeitnehmer, die einen Lehrgang brauchen:

```js
zeitnehmer: {
  label: 'Zeitnehmer',
  canTake: (person) => person.services.includes('zeitnehmer') || person.role === 'admin',
},
```

`person` hat `id`, `role` und `services` (aus `user_services`). Wer `canTake`
nicht erfüllt, sieht den Dienst, kann ihn aber nicht übernehmen, und bekommt
keine Push-Nachricht dazu. Sobald es mehr als eine Art gibt, zeigt die
Verwaltung ein Auswahlfeld „Art“.

## Aufbau

```
backend/duties/
  index.js        mount(app), Prüfung auf Migration 017
  routes.js       /api/duties/*
  service.js      Regeln, Transaktionen, Ereignisse für Push
  repository.js   SQL
  validation.js   Eingaben prüfen
  categories.js   Dienst-Arten und wer sie übernehmen darf
  config.js       Grenzen (7 Tage, 50 Plätze, …)
backend/db/migrations/017_duty_roster.sql
backend/scripts/stresstest.js
```

Push-Texte stehen in `push/messages.js`, die Auslöser in `push/triggers.js`.

## Endpunkte

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| GET | `/api/duties?from&to` | alle | veröffentlichte Dienste mit Belegung |
| POST | `/api/duties/:id/claim` | alle | übernehmen `{ clientTime }` |
| DELETE | `/api/duties/:id/claim` | alle | austragen |
| GET | `/api/duties/plans?past=1` | Verwaltung | Pläne mit Kennzahlen |
| GET | `/api/duties/plans/:id` | Verwaltung | ein Plan samt Diensten |
| POST | `/api/duties/plans` | Verwaltung | anlegen `{ title, location, notes, duties[], publish, notify }` |
| PATCH | `/api/duties/plans/:id` | Verwaltung | Titel, Ort, Notiz |
| POST | `/api/duties/plans/:id/publish` | Verwaltung | Entwurf veröffentlichen `{ notify }` |
| DELETE | `/api/duties/plans/:id` | Verwaltung | Plan löschen |
| POST | `/api/duties/plans/:id/duties` | Verwaltung | weitere Dienste `{ duties[], notify }` |
| PATCH | `/api/duties/:id` | Verwaltung | Dienst ändern |
| DELETE | `/api/duties/:id` | Verwaltung | Dienst löschen |
| DELETE | `/api/duties/:id/assignments/:userId` | Verwaltung | Person austragen |

Zusagen sind auf 30 je Minute und Person gebremst, Verwaltung auf 200 je
Viertelstunde. `GET /api/duties` liefert höchstens 1000 Dienste.

## Entfernen

1. In `server.js` die Zeile `require('./duties').mount(app);` löschen
2. Ordner `backend/duties/` und `frontend/src/components/duties/` löschen
3. Tabellen und Spalte: siehe Kopf von `017_duty_roster.sql`
