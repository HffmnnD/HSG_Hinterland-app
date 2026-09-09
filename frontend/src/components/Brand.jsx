import { Link } from 'react-router-dom';

/**
 * Wort-/Bildmarke der HSG Hinterland: grünes „H"-Signet + Schriftzug in Oswald.
 * Als Link (`to`) oder statisch verwendbar.
 */
export default function Brand({ to, className = '' }) {
  const inner = (
    <>
      <span className="brand__mark" aria-hidden="true">
        H
      </span>
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
