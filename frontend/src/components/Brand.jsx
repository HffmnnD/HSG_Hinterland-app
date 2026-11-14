import { Link } from 'react-router-dom';

import { useBranding } from '../hooks/useBranding';

/**
 * Wort-/Bildmarke der HSG Hinterland: eigenes Logo aus den App-Einstellungen
 * (Verwaltung → App-Einstellungen), sonst das grüne „H"-Signet, dazu der
 * Schriftzug. Als Link (`to`) oder statisch verwendbar.
 */
export default function Brand({ to, className = '' }) {
  const { logoUrl } = useBranding();
  const inner = (
    <>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="brand__logo" />
      ) : (
        <span className="brand__mark" aria-hidden="true">
          H
        </span>
      )}
      <span className="brand__name">HSG Hinterland</span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`brand ${className}`}
        aria-label="HSG Hinterland – zur Startseite"
      >
        {inner}
      </Link>
    );
  }

  return <div className={`brand ${className}`}>{inner}</div>;
}
