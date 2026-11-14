import { useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';
import MatchReportCard from './MatchReportCard';

/**
 * Auf der Spielseite direkt unter der Spielübersicht: Spielberichte, die
 * mit diesem Spiel verknüpft sind (geschrieben unter Verein → Infos).
 * Zugeklappt mit „Mehr lesen". Ohne Bericht erscheint nichts.
 *
 * @param {{ meetingId: string|null }} props
 */
export default function LinkedMatchReports({ meetingId }) {
  const [state, setState] = useState({ meetingId: null, reports: [] });

  useEffect(() => {
    if (!meetingId) return undefined;
    let cancelled = false;
    apiFetch(`/api/match-reports/by-meeting/${encodeURIComponent(meetingId)}`)
      .then((data) => {
        if (!cancelled) setState({ meetingId, reports: data?.reports ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ meetingId, reports: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const reports = state.meetingId === meetingId ? state.reports : [];
  if (reports.length === 0) return null;

  return (
    <section aria-labelledby="game-uploaded-report">
      <h2 id="game-uploaded-report" className="section-title">Spielbericht</h2>
      <div className="mt-3 space-y-4">
        {reports.map((report) => (
          <MatchReportCard key={report.id} report={report} showGameLink={false} />
        ))}
      </div>
    </section>
  );
}
