import { useEffect, useSyncExternalStore } from 'react';

import { apiFetch } from '../lib/api';

// App-Einstellungen für das Erscheinungsbild (Logo, App-Symbol, Login-Bild
// und -Sprüche) aus GET /api/branding – öffentlich, also auch vor dem Login.
// Ein gemeinsamer Speicher für alle Bauteile: geladen wird einmal je Seitenaufruf.

const DEFAULTS = {
  logoUrl: null,
  icon192Url: null,
  icon512Url: null,
  loginImageUrl: null,
  loginTitle: 'Dein Verein. Alles an einem Ort.',
  loginText: 'Training, Spiele und Dienste deiner Mannschaft – auf dem Handy wie am Rechner.',
};

let branding = DEFAULTS;
let started = false;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Neu laden (nach dem Speichern in der Verwaltung). */
export async function reloadBranding() {
  try {
    const data = await apiFetch('/api/branding');
    branding = { ...DEFAULTS, ...data };
    applyIcons(branding);
    emit();
  } catch {
    /* Ohne Antwort bleiben die Standards. */
  }
  return branding;
}

/** Eigenes Logo als Favicon und Apple-Symbol setzen (Website im Browser). */
function applyIcons(value) {
  const icon = value.icon192Url ?? value.logoUrl;
  if (!icon) return;
  const set = (rel, href, type) => {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    if (type) link.type = type;
    else link.removeAttribute('type');
  };
  set('icon', icon);
  set('apple-touch-icon', value.icon512Url ?? icon);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {typeof DEFAULTS} */
export function useBranding() {
  useEffect(() => {
    if (started) return;
    started = true;
    reloadBranding();
  }, []);
  return useSyncExternalStore(subscribe, () => branding);
}
