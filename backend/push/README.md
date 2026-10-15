# Push-Benachrichtigungen

Web Push für die installierte App (PWA) und den Browser. Kein Drittanbieter
wie Firebase: Der Server schickt verschlüsselte Nachrichten direkt an den
Push-Dienst des jeweiligen Browsers (Google, Apple, Mozilla, Microsoft).

## Was kommt wann?

| Kategorie (Schlüssel) | Auslöser | Wer bekommt es |
|---|---|---|
| Absagen & Änderungen (`changes`) | Termin abgesagt, wieder angesetzt, gelöscht, Zeit oder Halle geändert, Ligaspiel von nuLiga verlegt, Trainingsserie beendet | Spieler:innen und Trainerteam der Mannschaft |
| Neue Termine (`newEvents`) | Einzeltermin oder Trainingsserie angelegt | ebenso |
| Erinnerung (`reminders`, `reminderHours`) | 1 Std., 3 Std. oder 24 Std. vor Beginn | Spieler:innen, die nicht abgesagt haben und nicht im Urlaub/verletzt sind |
| Kurzfristige Absagen (`declines`) | Spieler:in sagt selbst weniger als 24 Std. vorher ab | Trainerteam |
| Beitrittsanfragen (`requests`) | Jemand möchte als Spieler:in/Trainer:in in die Mannschaft | Trainerteam (je Anfrage einmal) |
| Aufnahme (`roster`) | Beitritt bestätigt oder vom Trainerteam hinzugefügt | die Person selbst |
| Vereins-News (`news`) | Beitrag veröffentlicht | alle mit Push |
| Nachts ohne Ton (`quietHours`) | 22–7 Uhr kommen Nachrichten still an | – |

Wer eine Änderung selbst macht, bekommt dazu keine Nachricht. Fans bekommen
keine Termin-Nachrichten (sie sehen Termine auch in der App nicht).

Angelehnt an SpielerPlus, Spond und Heja. Der Unterschied: Bei euch gilt
„keine Rückmeldung = dabei", deshalb erinnert die App nicht ans Zusagen,
sondern daran, rechtzeitig abzusagen.

Bewusst nicht dabei: Live-Spielstände. Dafür müsste der Server nuLiga im
Minutentakt abfragen; der Live-Ticker in der App deckt das ab.

## Einrichten

1. `cd backend && npm install && npm run migrate` (Migration 016 legt drei Tabellen an)
2. `npm run push:keys` und die drei Zeilen in `backend/.env` übernehmen
3. Backend neu starten. Im Log steht `Push: Benachrichtigungen aktiv.`
4. In der App unter „Mein Konto“ → „Push“ → „Auf diesem Gerät aktivieren“

Ohne Schlüssel bleibt das Modul aus, die App läuft normal weiter.

**Voraussetzungen auf dem Gerät**

- HTTPS (oder `localhost`). Über `http://<LAN-IP>:5173` geht Push nicht.
- Ein gebautes Frontend (`npm run build`, zum Testen `npm run preview`). Im
  `npm run dev` gibt es keinen Service Worker.
- iPhone/iPad: ab iOS 16.4 und nur aus der App auf dem Home-Bildschirm
  (Safari → Teilen → „Zum Home-Bildschirm“). Die Einstellungen erklären das.
- Android, Windows, macOS: Chrome, Edge, Firefox, Samsung Internet.

Die Berechtigung fragt die App erst beim Tippen auf „Aktivieren“, nie beim Start.

## Aufbau

```
backend/push/              das Modul
  index.js                 mount(app): Routen, Auslöser, Erinnerungs-Takt
  routes.js                /api/push/* (Einstellungen, Geräte, Test)
  triggers.js              wann geht was an wen
  reminders.js             Erinnerungen, alle 5 Minuten
  messages.js              alle Texte
  sender.js                Versand, Ruhezeit, tote Geräte aufräumen
  preferences.js           Kategorien und Voreinstellungen
  repository.js            SQL (nur push_*-Tabellen werden beschrieben)
  config.js                VAPID-Schlüssel, erlaubte Push-Dienste
backend/services/appEvents.js   neutrale Ereignisse („Termin abgesagt“)
backend/db/migrations/016_push_notifications.sql

frontend/src/push/         Einstellungen und Browser-Logik
frontend/public/push-sw.js Push-Teil des Service Workers
frontend/public/pwa-*.png, push-badge.png   Symbole
```

Die Controller wissen nichts von Push. Sie melden nur über
`appEvents.publish(...)`, was passiert ist; `triggers.js` hört zu.

## Entfernen

1. Ordner `backend/push/` und `frontend/src/push/` löschen, ebenso
   `frontend/public/push-sw.js` und `frontend/public/push-badge.png`
2. `backend/server.js`: die Zeile `require('./push').mount(app);` entfernen
3. `frontend/vite.config.js`: die Zeile `importScripts: ['push-sw.js']` entfernen
4. `frontend/src/components/account/AccountPanel.jsx`: Import und die zwei
   Zeilen mit `pushAccountTab` entfernen
5. `frontend/src/context/AuthContext.jsx`: Import und Aufruf von
   `forgetThisDevice()` entfernen
6. `backend/package.json`: Skript `push:keys` und Abhängigkeit `web-push`
   entfernen, `VAPID_*` aus `.env` streichen
7. Datenbank:
   ```sql
   DROP TABLE IF EXISTS push_log, push_preferences, push_subscriptions;
   DELETE FROM schema_migrations WHERE filename = '016_push_notifications.sql';
   ```
   und `db/migrations/016_push_notifications.sql` löschen.

`services/appEvents.js` und die `appEvents.publish`-Aufrufe in den
Controllern dürfen bleiben: Ohne Zuhörer tun sie nichts.
