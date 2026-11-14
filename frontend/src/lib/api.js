// Zentraler fetch-Wrapper für die Backend-API.
// WICHTIG: `credentials: 'include'` bei jedem Request, damit der HttpOnly-Cookie
// (JWT) vom Backend gesetzt und bei Folge-Requests mitgesendet wird.
//
// Ohne VITE_API_BASE_URL werden relative Pfade verwendet. Zusammen mit dem
// Dev-Proxy in vite.config.js laufen API-Requests dann über dieselbe Origin
// wie das Frontend – damit entfallen CORS und Cross-Site-Cookie-Probleme.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Endpunkte, bei denen ein 401/403 eine normale fachliche Antwort ist
// (z. B. falsches Passwort) und keine abgelaufene Sitzung.
const AUTH_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
];

/** Vollständige Adresse eines API-Pfads (für Links und Kalender-Abos). */
export function apiUrl(path) {
  return `${API_BASE_URL || window.location.origin}${path}`;
}

let onSessionExpired = null;

// Eltern handeln als Kind: Solange gesetzt, schickt jede Anfrage den Header
// X-Act-As mit. Das Backend prüft die Verknüpfung bei JEDER Anfrage – der Wert
// hier ist nur ein Wunsch, keine Berechtigung. sessionStorage: gilt für diesen
// Tab und endet mit ihm, damit niemand versehentlich im Kinderkonto bleibt.
const ACT_AS_KEY = 'hsg.actAs';
let actAsId = null;
try {
  actAsId = Number(sessionStorage.getItem(ACT_AS_KEY)) || null;
} catch {
  actAsId = null;
}

/** Als Kind handeln (id) oder zurück ins eigene Konto (null). */
export function setActAs(id) {
  actAsId = id ? Number(id) : null;
  try {
    if (actAsId) sessionStorage.setItem(ACT_AS_KEY, String(actAsId));
    else sessionStorage.removeItem(ACT_AS_KEY);
  } catch {
    // Privater Modus o. Ä.: gilt dann nur bis zum Neuladen.
  }
}

export const getActAs = () => actAsId;

/**
 * Registriert einen Callback, der bei einer abgelaufenen/ungültigen Sitzung
 * (HTTP 401 ausserhalb der Login-Endpunkte) aufgerufen wird.
 * Wird vom AuthProvider gesetzt.
 */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export async function apiFetch(path, options = {}) {
  // Bei FormData (Datei-Uploads) darf der Content-Type NICHT gesetzt werden:
  // der Browser ergänzt ihn selbst inklusive multipart-Boundary.
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(actAsId ? { 'X-Act-As': String(actAsId) } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    // Netzwerkfehler / Server nicht erreichbar – als eigener Fehlertyp,
    // damit die UI das von einem 500er unterscheiden kann.
    const error = new Error(
      'Server nicht erreichbar. Läuft das Backend und besteht eine Netzwerkverbindung?'
    );
    error.status = 0;
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Antwort ohne JSON-Body (z. B. 204) – data bleibt null.
  }

  if (!response.ok) {
    const error = new Error(
      (data && data.message) || 'Es ist ein Fehler aufgetreten.'
    );
    error.status = response.status;
    error.data = data;

    // Sitzung abgelaufen oder Konto gesperrt -> global ausloggen.
    const isAuthEndpoint = AUTH_ENDPOINTS.includes(path);
    const sessionInvalid =
      response.status === 401 || (response.status === 403 && path === '/api/auth/me');

    if (!isAuthEndpoint && sessionInvalid && onSessionExpired) {
      onSessionExpired(error);
    }

    throw error;
  }

  return data;
}
