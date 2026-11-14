// „Als App installieren": Erkennung und Merker für den Hinweis auf der
// Startseite (components/InstallHint.jsx).
//
// Chrome, Edge und Samsung Internet melden per `beforeinstallprompt`, dass
// sie die App installieren könnten. Das Ereignis kommt nur EINMAL und meist
// kurz nach dem Laden – deshalb wird es hier schon beim Laden des Moduls
// abgefangen und aufgehoben, bis jemand auf „Installieren" tippt.
// Safari auf iPhone/iPad kennt das nicht: dort gibt es nur den Weg über
// „Teilen" → „Zum Home-Bildschirm", den der Hinweis kurz erklärt.

const DISMISS_KEY = 'hsg-install-hint-dismissed';
// Wer „Später" sagt, wird frühestens nach dieser Zeit wieder gefragt.
const DISMISS_DAYS = 45;

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Kein eigenes Mini-Banner des Browsers – wir zeigen unseren Hinweis.
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** Läuft die App schon als installierte Web-App (Home-Bildschirm)? */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/** iPhone/iPad (iPadOS meldet sich als Mac – erkennbar am Touchscreen). */
export function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Android-Gerät (für den allgemeinen Hinweis ohne Installations-Knopf). */
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

/**
 * Welche Art Hinweis passt zu diesem Gerät?
 *   'prompt'  Browser kann direkt installieren (Knopf „Installieren")
 *   'ios'     Anleitung über „Teilen" → „Zum Home-Bildschirm"
 *   'menu'    Android ohne Ereignis (z. B. Firefox): Anleitung übers Menü
 *   null      schon installiert oder nicht sinnvoll (Desktop ohne Angebot)
 */
export function installMode() {
  if (typeof window === 'undefined' || isStandalone()) return null;
  if (deferredPrompt) return 'prompt';
  if (isIos()) return 'ios';
  if (isAndroid()) return 'menu';
  return null;
}

/** Benachrichtigt, sobald sich `installMode()` ändern kann. */
export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Systemdialog „App installieren?" öffnen. true = angenommen. */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  event.prompt();
  const choice = await event.userChoice.catch(() => null);
  notify();
  return choice?.outcome === 'accepted';
}

export function isInstallHintDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissInstallHint() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Privater Modus o. ä.: Hinweis erscheint dann beim nächsten Besuch wieder.
  }
}
