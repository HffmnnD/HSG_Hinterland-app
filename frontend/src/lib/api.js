// Zentraler fetch-Wrapper für die Backend-API.
// WICHTIG: `credentials: 'include'` bei jedem Request, damit der HttpOnly-Cookie
// (JWT) vom Backend gesetzt und bei Folge-Requests mitgesendet wird.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Antwort ohne JSON-Body (z. B. bei manchen Fehlern) – data bleibt null.
  }

  if (!response.ok) {
    const error = new Error(
      (data && data.message) || 'Es ist ein Fehler aufgetreten.'
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
