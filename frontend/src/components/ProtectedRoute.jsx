import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import FullScreenLoader from './FullScreenLoader';

/**
 * Schützt Routen anhand von Login-Status und Rolle.
 *
 * - Noch am Laden        -> Ladeanzeige
 * - Nicht eingeloggt     -> Weiterleitung auf /login (Ziel wird gemerkt)
 * - Rolle nicht erlaubt  -> Weiterleitung auf /
 * - sonst                -> children
 *
 * Hinweis: Das ist reiner UX-Schutz. Die verbindliche Autorisierung erfolgt
 * im Backend (`checkRole`), da der Client-State manipulierbar ist.
 *
 * @param {string[]} [allowedRoles] Erlaubte Rollen. Ohne Angabe genügt ein
 *   beliebiger eingeloggter Nutzer.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    // Ziel merken, damit nach dem Login dorthin zurückgesprungen werden kann.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
