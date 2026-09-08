import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { apiFetch, setSessionExpiredHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Globaler Auth-Status.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Letzter Auth-Fehler als { message, status } – wird von den Formularen
  // angezeigt und beim Wechsel/Tippen zurückgesetzt.
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  // Wird von apiFetch aufgerufen, wenn eine Sitzung abgelaufen oder das Konto
  // gesperrt wurde: Nutzer lokal ausloggen, ProtectedRoute leitet dann um.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Beim ersten Laden prüfen, ob bereits ein gültiger Cookie existiert.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch('/api/auth/me');
        if (!cancelled) setUser(data?.user ?? null);
      } catch {
        // 401/403 -> nicht (mehr) eingeloggt, das ist ein normaler Zustand.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auth-Status neu laden, ohne die gesamte App in den Ladezustand zu setzen.
  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data?.user ?? null);
      return data?.user ?? null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      setError({ message: err.message, status: err.status });
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  const register = useCallback(
    async ({ firstName, lastName, email, password }) => {
      setError(null);
      try {
        const data = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ firstName, lastName, email, password }),
        });
        return { success: true, message: data.message, user: data.user };
      } catch (err) {
        setError({ message: err.message, status: err.status });
        return { success: false, message: err.message, status: err.status };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Auch bei Fehler (z. B. Server offline) lokal ausloggen.
    } finally {
      setUser(null);
      setError(null);
    }
  }, []);

  const value = {
    user,
    // Rolle des angemeldeten Nutzers (RBAC): 'admin' | 'trainer' | 'spieler' |
    // 'zuschauer' – oder null, wenn nicht eingeloggt.
    role: user?.role ?? null,
    loading,
    error,
    clearError,
    login,
    register,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  }
  return context;
}
