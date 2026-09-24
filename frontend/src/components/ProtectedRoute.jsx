import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import FullScreenLoader from './FullScreenLoader';

// Pfad des Onboarding-Assistenten. Steht hier und in App.jsx – deshalb als
// Konstante, damit beide nicht auseinanderlaufen.
export const ONBOARDING_PATH = '/willkommen';

/**
 * Schützt Routen anhand von Login-Status, Rolle und Einrichtungsstand.
 *
 * - Noch am Laden          -> Ladeanzeige
 * - Nicht eingeloggt       -> Weiterleitung auf /login (Ziel wird gemerkt)
 * - Onboarding offen       -> Weiterleitung auf /willkommen
 * - Rolle nicht erlaubt    -> Weiterleitung auf /
 * - sonst                  -> children
 *
 * Hinweis: Das ist reiner UX-Schutz. Die verbindliche Autorisierung erfolgt
 * im Backend (`checkRole`), da der Client-State manipulierbar ist.
 *
 * @param {string[]} [allowedRoles] Erlaubte Rollen. Ohne Angabe genügt ein
 *   beliebiger eingeloggter Nutzer.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, role, loading, needsOnboarding } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    // Ziel merken, damit nach dem Login dorthin zurückgesprungen werden kann.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Direkt nach der Registrierung: zuerst einrichten. Ohne die Mannschaftswahl
  // wären Kalender und Startseite leer, und niemand wüsste, warum. Das Ziel
  // wird gemerkt – nach dem Assistenten geht es dorthin.
  if (needsOnboarding && location.pathname !== ONBOARDING_PATH) {
    return (
      <Navigate to={ONBOARDING_PATH} replace state={{ from: location }} />
    );
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
