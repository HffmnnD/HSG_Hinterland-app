// Push-Teil des Service Workers. vite.config.js bindet diese Datei per
// `importScripts` in den generierten Service Worker ein. Zum Entfernen des
// Push-Moduls: Datei löschen und die Zeile in vite.config.js entfernen.

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'HSG Hinterland', {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/push-badge.png',
      lang: 'de',
      // Gleicher Tag ersetzt die ältere Nachricht zum selben Termin, statt
      // drei Meldungen übereinander zu stapeln.
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      silent: Boolean(data.silent),
      data: { url: data.url || '/' },
    })
  );
});

// Tippen öffnet die passende Seite – in einem schon offenen Fenster der App,
// sonst in einem neuen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (!open) return self.clients.openWindow(url);
      return open.focus().then((client) => (client.navigate ? client.navigate(url) : client));
    })
  );
});

// Der Browser erneuert ein Abo gelegentlich von sich aus. Dann das neue
// gleich beim Server eintragen, sonst kämen keine Nachrichten mehr an.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription?.options;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then((subscription) =>
      fetch('/api/push/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
    )
  );
});
