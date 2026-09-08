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

let onSessionExpired = null;

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
