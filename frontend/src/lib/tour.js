// Einführung (components/tour/AppTour.jsx) starten oder vormerken.

// Merker „Einführung nach der Kontoeröffnung zeigen" – gesetzt vom
// Onboarding-Assistenten, gelöscht, sobald die Einführung geschlossen wird.
export const PENDING_KEY = 'hsg-tour-pending';
export const START_EVENT = 'hsg:start-tour';

/** Einführung beim nächsten Seitenaufbau zeigen (nach dem Onboarding). */
export function queueTour() {
  try {
    localStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* Speicher gesperrt – dann gibt es sie nur über die Einstellungen. */
  }
}

/** Einführung sofort starten (Einstellungen → Einführung). */
export function startTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

export function isPending() {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}
