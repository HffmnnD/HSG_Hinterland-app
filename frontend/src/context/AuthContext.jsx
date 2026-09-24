import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  /**
   * Registrierung – bewusst nur Name, E-Mail und Passwort.
   *
   * Mannschaften, Beteiligung und Design fragt der Onboarding-Assistent beim
   * ersten Login ab (siehe components/onboarding/). Das Konto wartet bis dahin
   * auf die Freigabe durch die Verwaltung, es gibt also noch keine Sitzung.
   */
  const register = useCallback(
    async ({ firstName, lastName, email, password }) => {
      setError(null);
      try {
        const data = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ firstName, lastName, email, password }),
        });
        return { success: true, message: data.message };
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

  /**
   * Abschluss des Onboarding-Assistenten: Mannschaftswahl + Design.
   * Der Server antwortet mit dem frischen Profil – damit ist das Konto sofort
   * „eingerichtet" und die App zeigt die Startseite, ohne /me erneut zu holen.
   *
   * @param {{ teams: {teamId:number, relationType:string}[], theme: string }} input
   */
  const completeOnboarding = useCallback(async (input) => {
    try {
      const data = await apiFetch('/api/auth/me/onboarding', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (data?.user) setUser(data.user);
      return { success: true, message: data?.message, user: data?.user };
    } catch (err) {
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  /**
   * Nachträgliche Änderung derselben Angaben unter „Mein Konto".
   * `teams` weglassen heisst „Mannschaften unverändert".
   */
  const updatePreferences = useCallback(async (input) => {
    try {
      const data = await apiFetch('/api/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      if (data?.user) setUser(data.user);
      return { success: true, message: data?.message, user: data?.user };
    } catch (err) {
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  /** Eigenes Passwort ändern. Die Sitzung bleibt bestehen. */
  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    try {
      const data = await apiFetch('/api/auth/me/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      return { success: true, message: data?.message };
    } catch (err) {
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  // `useMemo` ist hier kein Feintuning: Ohne es entstünde bei JEDEM Rendern des
  // Providers ein neues Objekt, und da der Kontext an der Wurzel der App hängt,
  // würde damit jede Seite, jede Navigation und jede Tabelle neu gezeichnet –
  // auch wenn sich am Anmeldestatus nichts geändert hat.
  const value = useMemo(
    () => ({
      user,
      // Rolle des angemeldeten Nutzers (RBAC): 'admin' | 'sub_admin' |
      // 'trainer' | 'spieler' | 'zuschauer' – oder null, wenn nicht eingeloggt.
      role: user?.role ?? null,
      // Mannschaften des angemeldeten Nutzers
      // ([{ id, code, name, relationType, isConfirmed }]).
      teams: user?.teams ?? [],
      // Helferdienste des angemeldeten Nutzers (['zeitnehmer', …]).
      services: user?.services ?? [],
      // Steht der Onboarding-Assistent noch an?
      needsOnboarding: Boolean(user) && !user.onboardingCompleted,
      loading,
      error,
      clearError,
      login,
      register,
      logout,
      refresh,
      completeOnboarding,
      updatePreferences,
      changePassword,
    }),
    [
      user,
      loading,
      error,
      clearError,
      login,
      register,
      logout,
      refresh,
      completeOnboarding,
      updatePreferences,
      changePassword,
    ]
  );

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
