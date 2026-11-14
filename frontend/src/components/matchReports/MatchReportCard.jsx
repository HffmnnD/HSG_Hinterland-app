import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Pencil, Trash2, Trophy } from 'lucide-react';

import Lightbox from '../Lightbox';
import { excerpt, formatReportDate, reportGamePath } from '../../lib/content';
import MatchReportFiles from './MatchReportFiles';

/**
 * Ein Spielbericht: Titelbild, Mannschaft, Datum und Gegner, Titel und der
 * Anfang des Textes. „Mehr lesen" zeigt den ganzen Bericht samt Bildern und
 * PDFs, am Ende klappt „Weniger lesen" ihn wieder zu.
 *
 * @param {{ report: object, showGameLink?: boolean, onEdit?: () => void,
 *           onDelete?: () => void, busy?: boolean }} props
 *   `showGameLink`: Verweis „Zum Spielverlauf" (auf der Spielseite selbst aus).
 */
export default function MatchReportCard({ report, showGameLink = true, onEdit, onDelete, busy = false }) {
  const [open, setOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);

  const images = report.files.filter((file) => file.kind === 'image');
  const cover = images[0] ?? null;
  const { short, cut } = excerpt(report.body ?? '', 280);
  const hasMore = cut || report.files.length > (cover ? 1 : 0);
  const gamePath = showGameLink ? reportGamePath(report) : null;

  const meta = [
    report.team?.name,
    formatReportDate(report.gameDate),
    report.opponent ? `${report.isHome === false ? 'bei' : 'gegen'} ${report.opponent}` : null,
  ].filter(Boolean);

  return (
    <article className="card-accent min-w-0">
      {cover && !open && (
        <button
          type="button"
          onClick={() => setCoverOpen(true)}
          className="news-cover mb-3"
          aria-label={`Titelbild von „${report.title}" in voller Größe ansehen`}
        >
          <img src={cover.url} alt="" loading="lazy" />
          {images.length > 1 && <span className="news-cover__count">{images.length} Bilder</span>}
        </button>
      )}

      <p className="eyebrow flex flex-wrap items-center gap-x-1.5">
        <span className="badge badge-confirmed">
          <Trophy size={11} aria-hidden="true" /> Spielbericht
        </span>
        {meta.join(' · ')}
      </p>

      <h3 className="section-title mt-1.5 text-base sm:text-lg">{report.title}</h3>
      {report.summary && <p className="mt-1 font-semibold text-ink-soft">{report.summary}</p>}

      {report.body && <p className="news-body mt-3">{open ? report.body : short}</p>}

      {!open && hasMore && (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm -ml-3 mt-1">
          <ChevronDown size={14} aria-hidden="true" />
          Mehr lesen
        </button>
      )}

      {open && (
        <>
          {report.files.length > 0 && (
            <div className="mt-4">
              <MatchReportFiles report={report} />
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            {report.uploadedBy?.name ? `Geschrieben von ${report.uploadedBy.name}` : ''}
          </p>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm -ml-3 mt-1">
            <ChevronUp size={14} aria-hidden="true" />
            Weniger lesen
          </button>
        </>
      )}

      {(gamePath || onEdit || onDelete) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {gamePath && (
            <Link to={gamePath} state={{ teamName: report.team?.name, fromTab: 'spielplan' }} className="btn btn-outline btn-sm">
              Zum Spielverlauf
            </Link>
          )}
          {onEdit && (
            <button type="button" onClick={onEdit} disabled={busy} className="btn btn-ghost btn-sm">
              <Pencil size={14} aria-hidden="true" /> Bearbeiten
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} className="btn btn-ghost btn-sm text-danger">
              <Trash2 size={14} aria-hidden="true" /> Löschen
            </button>
          )}
        </div>
      )}

      {coverOpen && (
        <Lightbox
          images={images.map((file) => file.url)}
          startIndex={0}
          title={report.title}
          onClose={() => setCoverOpen(false)}
        />
      )}
    </article>
  );
}
