import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';

import AppLayout from '../components/AppLayout';
import ClubEventsSection from '../components/clubEvents/ClubEventsSection';
import LibrarySection from '../components/library/LibrarySection';
import NewsCard from '../components/NewsCard';
import MatchReportCard from '../components/matchReports/MatchReportCard';
import MatchReportEditor from '../components/matchReports/MatchReportEditor';
import { useApiResource } from '../hooks/useSchedule';
import { useNews } from '../hooks/useNews';
import { useConfirm } from '../hooks/useConfirm';
import { apiFetch } from '../lib/api';

const select = (result) => result ?? null;
const selectTeams = (result) => result?.teams ?? [];
const NO_TEAMS = [];
const PAGE = 20;

// Alte Links (?tab=brett) landen im neuen Reiter.
const TAB_ALIASES = { brett: 'infos' };

const FILTERS = [
  { key: 'all', label: 'Alles' },
  { key: 'reports', label: 'Spielberichte' },
  { key: 'news', label: 'News' },
  { key: 'docs', label: 'Dokumente' },
];

/**
 * Reiter „Verein": Vereinstermine mit Abfrage und „Infos" – Spielberichte,
 * die News von der Startseite („Aktuelles aus dem Verein") und Dokumente.
 */
export default function ClubPage() {
  const [params, setParams] = useSearchParams();
  const { data } = useApiResource('/api/library/overview', select, null);

  const tabs = [
    { key: 'termine', label: 'Termine' },
    { key: 'infos', label: 'Infos' },
  ];
  const requested = TAB_ALIASES[params.get('tab')] ?? params.get('tab');
  const active = tabs.some((tab) => tab.key === requested) ? requested : 'termine';

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Verein</h1>

      <div className="tabs mt-4" role="tablist" aria-label="Bereiche">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setParams(tab.key === 'termine' ? {} : { tab: tab.key }, { replace: true })}
            className={`tab ${active === tab.key ? 'tab--active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {active === 'termine' && <ClubEventsSection />}
        {active === 'infos' && <InfosSection showDocs={Boolean(data?.board)} />}
      </div>
    </AppLayout>
  );
}

/** Spielberichte und News als ein Strom, neueste zuerst – plus Dokumente. */
function InfosSection({ showDocs }) {
  const [filter, setFilter] = useState('all');
  const { news, loading: newsLoading } = useNews();
  const { data: writableTeams } = useApiResource('/api/match-reports/meta', selectTeams, NO_TEAMS);
  const [reports, setReports] = useState({ items: [], hasMore: false, loaded: false, error: null });
  const [editor, setEditor] = useState(null); // { report: object|null }
  const [notice, setNotice] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const loadReports = useCallback(async (offset = 0) => {
    try {
      const result = await apiFetch(`/api/match-reports?limit=${PAGE}&offset=${offset}`);
      setReports((prev) => ({
        items: offset === 0 ? result.reports : [...prev.items, ...result.reports],
        hasMore: Boolean(result.hasMore),
        loaded: true,
        error: null,
      }));
    } catch (err) {
      setReports((prev) => ({ ...prev, loaded: true, error: err.message }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/match-reports?limit=${PAGE}&offset=0`)
      .then((result) => {
        if (!cancelled) setReports({ items: result.reports, hasMore: Boolean(result.hasMore), loaded: true, error: null });
      })
      .catch((err) => {
        if (!cancelled) setReports({ items: [], hasMore: false, loaded: true, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const feed = useMemo(() => {
    const items = [];
    if (filter !== 'news') {
      for (const report of reports.items) items.push({ kind: 'report', at: report.createdAt, report });
    }
    if (filter !== 'reports') {
      for (const item of news) items.push({ kind: 'news', at: item.createdAt, item });
    }
    return items.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [filter, news, reports.items]);

  const remove = async (report) => {
    const ok = await confirm({
      title: 'Spielbericht löschen?',
      text: `„${report.title}" mit allen Bildern löschen? Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/match-reports/${report.id}`, { method: 'DELETE' });
      setNotice('Spielbericht gelöscht.');
      await loadReports(0);
    } catch (err) {
      setNotice(null);
      setReports((prev) => ({ ...prev, error: err.message }));
    }
  };

  const filters = FILTERS.filter((entry) => entry.key !== 'docs' || showDocs);
  const loading = newsLoading || !reports.loaded;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Infos filtern" className="flex flex-wrap gap-2">
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              aria-pressed={filter === entry.key}
              className={`chip chip-sm ${filter === entry.key ? 'chip-active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {writableTeams.length > 0 && filter !== 'docs' && (
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditor({ report: null })}>
            <PenLine size={15} aria-hidden="true" /> Spielbericht schreiben
          </button>
        )}
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {reports.error && (
        <div role="alert" className="alert alert-error">
          {reports.error}
        </div>
      )}

      {filter === 'docs' ? (
        <LibrarySection scope="board" />
      ) : loading ? (
        <span className="skeleton block h-40 w-full" />
      ) : feed.length === 0 ? (
        <p className="card-note">
          {filter === 'reports' ? 'Noch keine Spielberichte.' : filter === 'news' ? 'Keine News.' : 'Noch keine Infos.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {feed.map((entry) => (
            <li key={`${entry.kind}-${entry.kind === 'report' ? entry.report.id : entry.item.id}`}>
              {entry.kind === 'report' ? (
                <MatchReportCard
                  report={entry.report}
                  onEdit={entry.report.canManage ? () => setEditor({ report: entry.report }) : undefined}
                  onDelete={entry.report.canManage ? () => remove(entry.report) : undefined}
                />
              ) : (
                <NewsCard item={entry.item} />
              )}
            </li>
          ))}
        </ul>
      )}

      {filter !== 'docs' && filter !== 'news' && reports.hasMore && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => loadReports(reports.items.length)}>
          Ältere Spielberichte laden
        </button>
      )}

      {editor && (
        <MatchReportEditor
          teams={writableTeams}
          report={editor.report}
          onClose={() => setEditor(null)}
          onSaved={async (message) => {
            setEditor(null);
            setNotice(message);
            await loadReports(0);
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
