import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import AuthScreen from './components/auth/AuthScreen';
import Dashboard from './components/Dashboard';
import AdminPage from './components/AdminPage';
import TeamPage from './components/TeamPage';
import TeamsPage from './components/TeamsPage';
import SchedulePage from './components/SchedulePage';
import ProtectedRoute from './components/ProtectedRoute';
import FullScreenLoader from './components/FullScreenLoader';
import ScrollToTop from './components/ScrollToTop';
import { MANAGEMENT_ROLES } from './lib/roles';

// Bereits eingeloggte Nutzer gehören nicht auf die Login-Seite. Wenn sie vorher
// eine geschützte Seite aufrufen wollten, geht es dorthin zurück.
function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (user) {
    const target = location.state?.from?.pathname ?? '/';
    return <Navigate to={target} replace />;
  }
  return <AuthScreen />;
}

export default function App() {
  const { loading } = useAuth();

  // Nur der initiale GET /api/auth/me setzt `loading` – danach bleibt der
  // Router montiert (refresh() löst keinen Vollbild-Ladezustand mehr aus).
  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        {/* Mannschafts-Übersicht (Reiter „Teams" der Hauptnavigation) */}
        <Route
          path="/teams"
          element={
            <ProtectedRoute>
              <TeamsPage />
            </ProtectedRoute>
          }
        />

        {/* Mannschaftsseite – für alle angemeldeten Mitglieder sichtbar.
            Verwaltungsfunktionen schaltet das Backend per canManage frei. */}
        <Route
          path="/teams/:code"
          element={
            <ProtectedRoute>
              <TeamPage />
            </ProtectedRoute>
          }
        />

        {/* Spielplan & Termine – aktuell Vorschau auf das nächste Modul */}
        <Route
          path="/termine"
          element={
            <ProtectedRoute>
              <SchedulePage />
            </ProtectedRoute>
          }
        />

        {/* Unbekannte Pfade -> Startseite */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
