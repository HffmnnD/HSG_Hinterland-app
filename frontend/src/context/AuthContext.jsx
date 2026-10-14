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
   * Der Server legt das Konto an und meldet in derselben Antwort an (Cookie +
   * Profil). Deshalb wird `user` hier direkt gesetzt: Die App zeigt danach von
   * selbst den Onboarding-Assistenten, in dem Beteiligung, Mannschaften und
   * Design abgefragt werden. Ein zweites Anmeldeformular direkt nach dem
   * ersten gibt es nicht.
   */
  const register = useCallback(
    async ({ firstName, lastName, email, password }) => {
      setError(null);
      try {
        const data = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ firstName, lastName, email, password }),
        });
        setUser(data.user);
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

  /**
   * Profilbild hochladen. `FormData` statt JSON – apiFetch setzt dafür
   * bewusst keinen Content-Type, den ergänzt der Browser samt Grenzmarke.
   */
  const uploadPhoto = useCallback(async (file) => {
    const form = new FormData();
    form.append('photo', file);
    try {
      const data = await apiFetch('/api/auth/me/photo', {
        method: 'POST',
        body: form,
      });
      if (data?.user) setUser(data.user);
      return { success: true, message: data?.message };
    } catch (err) {
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  /** Profilbild entfernen – danach stehen wieder die Initialen. */
  const removePhoto = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me/photo', { method: 'DELETE' });
      if (data?.user) setUser(data.user);
      return { success: true, message: data?.message };
    } catch (err) {
      return { success: false, message: err.message, status: err.status };
    }
  }, []);

  /**
   * Eigenes Passwort ändern. Der Server erneuert dabei den Sitzungs-Cookie,
   * damit dieses Gerät angemeldet bleibt – alle anderen Sitzungen enden
   * (siehe users.sessions_valid_from). Das Profil ändert sich nicht, deshalb
   * wird hier auch kein `user` gesetzt.
   */
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
      completeOnboarding,
      updatePreferences,
      uploadPhoto,
      removePhoto,
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
      completeOnboarding,
      updatePreferences,
      uploadPhoto,
      removePhoto,
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
