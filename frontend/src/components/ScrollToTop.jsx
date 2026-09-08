import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Setzt bei jedem Seitenwechsel den Scroll-Stand zurück.
 *
 * Ohne das behält der Router die Position der vorherigen Seite bei – wer
 * unten im News-Feed auf „Teams" tippt, landet sonst mitten in der neuen
 * Seite. Rendert nichts.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
