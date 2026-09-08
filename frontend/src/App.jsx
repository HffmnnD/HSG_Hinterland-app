import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import AuthScreen from './components/auth/AuthScreen';
import Dashboard from './components/Dashboard';
import AdminPage from './components/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';
import FullScreenLoader from './components/FullScreenLoader';

export default function App() {
  const { user, loading } = useAuth();

  // Solange der initiale GET /api/auth/me läuft: Ladeanzeige.
  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <AuthScreen />}
      />

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
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      {/* Unbekannte Pfade -> Startseite */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
