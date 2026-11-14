import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import AuthScreen from './components/auth/AuthScreen';
import HomePage from './pages/HomePage';
import AdminPage from './components/AdminPage';
import TeamPage from './components/TeamPage';
import TeamsPage from './components/TeamsPage';
import GamePage from './components/GamePage';
import DutiesPage from './pages/DutiesPage';
import TrainingPage from './pages/TrainingPage';
import AccountPage from './pages/AccountPage';
import ClubPage from './pages/ClubPage';
import ProtectedRoute, { ONBOARDING_PATH } from './components/ProtectedRoute';
import FullScreenLoader from './components/FullScreenLoader';
import ScrollToTop from './components/ScrollToTop';
import { ADMIN_PERMISSIONS } from './lib/roles';
import { useBranding } from './hooks/useBranding';

// Der Onboarding-Assistent läuft genau einmal je Konto – danach nie wieder.
// Als eigenes Teilstück lädt ihn nur, wer ihn tatsächlich sieht; alle anderen
// sparen sich den Code bei jedem Aufruf der App.
const OnboardingWizard = lazy(() =>
  import('./components/onboarding/OnboardingWizard')
);

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

// Der Assistent läuft nur, solange er ansteht. Ist alles eingerichtet, führt
// der Pfad dorthin zurück, wo man hin wollte – oder auf die Startseite.
function OnboardingRoute() {
  const { needsOnboarding } = useAuth();
  const location = useLocation();

  if (!needsOnboarding) {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  }
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <OnboardingWizard />
    </Suspense>
  );
}

/** /kalender?bereich=… aus früheren Versionen an die neuen Orte. */
function LegacyCalendarRedirect() {
  const [params] = useSearchParams();
  const area = params.get('bereich');
  const tab = params.get('tab');
  const suffix = tab ? `?tab=${tab}` : '';
  if (area === 'dienste') return <Navigate to={`/dienste${suffix}`} replace />;
  if (area === 'training') return <Navigate to={`/training${suffix}`} replace />;
  return <Navigate to="/" replace />;
}

export default function App() {
  const { loading } = useAuth();
  // Logo/Favicon aus den App-Einstellungen früh laden (auch vor dem Login).
  useBranding();

  // `loading` setzt ausschliesslich der initiale GET /api/auth/me. Alle
  // späteren Aufrufe (Anmelden, Onboarding, Konto-Einstellungen) tauschen nur
  // das Profil aus – der Router bleibt montiert, es gibt kein zweites
  // Vollbild-Laden mitten in der Sitzung.
  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />

        {/* Einrichtung beim ersten Login. Liegt hinter <ProtectedRoute>, weil
            ohne Anmeldung nichts einzurichten ist – die Weiterleitung hierher
            kommt aus derselben Komponente. */}
        <Route
          path={ONBOARDING_PATH}
          element={
            <ProtectedRoute>
              <OnboardingRoute />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute permissions={ADMIN_PERMISSIONS}>
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

        {/* Spielseite: Live-Ticker während des Spiels, Spielbericht danach.
            Erreichbar aus „Aktuelles Spiel" und aus dem Spielplan. */}
        <Route
          path="/teams/:code/spiele/:gameId"
          element={
            <ProtectedRoute>
              <GamePage />
            </ProtectedRoute>
          }
        />

        {/* Dienste, Teamplaner, Konto (= Einstellungen) */}
        <Route path="/dienste" element={<ProtectedRoute><DutiesPage /></ProtectedRoute>} />
        <Route path="/training" element={<ProtectedRoute><TrainingPage /></ProtectedRoute>} />
        <Route path="/konto" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        {/* Vereinstermine und Infos (Spielberichte, News, Dokumente) */}
        <Route path="/verein" element={<ProtectedRoute><ClubPage /></ProtectedRoute>} />

        {/* Alter Reiter „Kalender": Lesezeichen und alte Push-Links weiterleiten. */}
        <Route path="/kalender" element={<LegacyCalendarRedirect />} />

        {/* Unbekannte Pfade -> Startseite */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
