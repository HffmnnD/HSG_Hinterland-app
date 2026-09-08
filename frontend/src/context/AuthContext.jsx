import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { apiFetch } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Globaler Auth-Status.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auf Wunsch (z. B. nach externem Statuswechsel) den Auth-Status neu laden.
  const loadCurrentUser = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data.user);
    } catch {
      // 401 -> nicht eingeloggt, das ist ein normaler Zustand.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Beim ersten Laden prüfen, ob bereits ein gültiger Cookie existiert.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch('/api/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

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
      setError(err.message);
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
        setError(err.message);
        return { success: false, message: err.message, status: err.status };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Auch bei Fehler lokal ausloggen.
    } finally {
      setUser(null);
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    clearError,
    login,
    register,
    logout,
    refresh: loadCurrentUser,
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
