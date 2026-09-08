import { useAuth } from './context/AuthContext';
import AuthScreen from './components/auth/AuthScreen';
import Dashboard from './components/Dashboard';
import FullScreenLoader from './components/FullScreenLoader';

export default function App() {
  const { user, loading } = useAuth();

  // Solange der initiale GET /api/auth/me läuft: Ladeanzeige.
  if (loading) {
    return <FullScreenLoader />;
  }

  // Einfache "Navigation": eingeloggt -> Dashboard, sonst -> Login/Registrierung.
  return user ? <Dashboard /> : <AuthScreen />;
}
