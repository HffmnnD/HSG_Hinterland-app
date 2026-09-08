import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import FullScreenLoader from './FullScreenLoader';

/**
 * Schützt Routen anhand von Login-Status und Rolle.
 *
 * - Noch am Laden        -> Ladeanzeige
 * - Nicht eingeloggt     -> Weiterleitung auf /login
 * - Rolle nicht erlaubt  -> Weiterleitung auf /
 * - sonst                -> children
 *
 * @param {string[]} [allowedRoles] Erlaubte Rollen. Ohne Angabe genügt ein
 *   beliebiger eingeloggter Nutzer.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
