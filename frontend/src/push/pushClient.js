// Browser-Seite des Push-Moduls: Unterstützung erkennen, Berechtigung
// anfragen, Abo beim Server ein- und austragen.
import { apiFetch } from '../lib/api';

/** Läuft die App als installierte Web-App (Home-Bildschirm)? */
function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS meldet sich als Mac – erkennbar am Touchscreen.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Was dieses Gerät kann:
 *   'supported'   alles da
 *   'ios-install' iPhone/iPad im Browser – Push gibt es dort nur aus der
 *                 installierten App (ab iOS 16.4)
 *   'insecure'    keine sichere Verbindung (http über die LAN-IP)
 *   'unsupported' Browser kann kein Web Push
 */
export function pushSupport() {
  const hasApi =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApi) {
    if (isIos() && !isStandalone()) return 'ios-install';
    if (!window.isSecureContext) return 'insecure';
    return 'unsupported';
  }
  if (!window.isSecureContext) return 'insecure';
  return 'supported';
}

/** Aktuelle Berechtigung: 'granted' | 'denied' | 'default'. */
export const permissionState = () =>
  'Notification' in window ? Notification.permission : 'denied';

/**
 * Service Worker der PWA. In `npm run dev` gibt es keinen (siehe README) –
 * dann null statt endlos zu warten.
 */
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Base64url -> Uint8Array (Format, das pushManager.subscribe erwartet). */
function decodeKey(base64url) {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** „Android · Chrome" – nur zur Anzeige. */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua)
    ? 'Android'
    : isIos()
      ? 'iPhone/iPad'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac/i.test(ua)
          ? 'Mac'
          : 'Linux';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /samsungbrowser/i.test(ua)
      ? 'Samsung Internet'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /chrome|crios/i.test(ua)
          ? 'Chrome'
          : 'Safari';
  return `${os} · ${browser}`;
}

/**
 * Push auf diesem Gerät einschalten. Fragt die Berechtigung – muss deshalb
 * direkt aus einem Klick heraus aufgerufen werden (Browser-Vorgabe).
 */
export async function enablePush(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const error = new Error(
      permission === 'denied'
        ? 'Benachrichtigungen sind blockiert. Erlauben kannst du sie in den Einstellungen deines Browsers bzw. Handys.'
        : 'Ohne deine Erlaubnis kann die App keine Benachrichtigungen schicken.'
    );
    error.code = permission;
    throw error;
  }

  const reg = await registration();
  if (!reg) {
    throw new Error('Push geht nur in der installierten bzw. gebauten App, nicht im Entwicklungsmodus.');
  }

  let subscription;
  try {
    subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      }));
  } catch {
    // Häufigster Grund: privates Fenster oder ein Browser ohne Push-Dienst.
    throw new Error(
      'Dein Browser hat die Anmeldung beim Push-Dienst abgelehnt. In privaten Fenstern geht Push nicht.'
    );
  }

  await apiFetch('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON(), deviceLabel: deviceLabel() }),
  });
  return subscription;
}

/** Push auf diesem Gerät ausschalten. */
export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await apiFetch('/api/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  await subscription.unsubscribe();
}

/**
 * Beim Abmelden: Das Gerät soll keine Nachrichten des abgemeldeten Kontos
 * mehr bekommen (geteiltes Familien-Handy). Wirft nie.
 */
export async function forgetThisDevice() {
  try {
    // Höchstens drei Sekunden – das Abmelden soll nie hängen.
    await Promise.race([disablePush(), new Promise((done) => setTimeout(done, 3000))]);
  } catch {
    // Abmelden darf daran nicht scheitern.
  }
}
