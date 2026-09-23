import { ChevronLeft, ChevronRight } from 'lucide-react';

import { formatNumber } from '../../../lib/format';

/**
 * Seitenschaltung unter einer Tabelle.
 *
 * Zeigt „21–40 von 1.284" statt nur „Seite 2 von 65" – die Spanne beantwortet
 * die Frage, die man beim Blättern tatsächlich hat.
 *
 * @param {number} page       aktuelle Seite (1-basiert)
 * @param {number} pageCount
 * @param {number} total      Gesamtzahl der Treffer
 * @param {number} pageSize
 * @param {(page:number) => void} onChange
 * @param {string} [unit]     Bezeichnung im Plural, z. B. „Mitglieder"
 */
export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  unit = 'Einträge',
}) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <p className="text-xs text-ink-muted">
        <span className="font-bold text-ink-soft">
          {formatNumber(from)}–{formatNumber(to)}
        </span>{' '}
        von {formatNumber(total)} {unit}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="pagination__btn"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Zurück
        </button>

        <span className="font-display text-xs font-semibold text-ink-muted">
          {page} / {pageCount}
        </span>

        <button
          type="button"
          className="pagination__btn"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          Weiter
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
