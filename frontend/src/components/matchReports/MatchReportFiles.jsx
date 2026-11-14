import { useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';

import Lightbox from '../Lightbox';

/** Dateigröße lesbar: „1,4 MB". */
function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Dateien eines Spielberichts: PDFs direkt im Bericht (plus Öffnen und
 * Herunterladen – auf dem Handy zeigen manche Browser eingebettete PDFs nur
 * als erste Seite), Bilder als Vorschau mit dem vorhandenen Vollbild-Betrachter.
 *
 * @param {{ report: object, onRemoveFile?: (file:object) => void, busy?: boolean }} props
 */
export default function MatchReportFiles({ report, onRemoveFile, busy = false }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const pdfs = report.files.filter((f) => f.kind === 'pdf');
  const images = report.files.filter((f) => f.kind === 'image');
  const canRemove = Boolean(onRemoveFile);

  return (
    <div className="space-y-4">
      {pdfs.map((file) => (
        <div key={file.id} className="rounded-md border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink">
              <FileText size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
              <span className="truncate">{file.originalName ?? 'Spielbericht.pdf'}</span>
              <span className="shrink-0 text-xs font-normal text-ink-muted">{formatSize(file.sizeBytes)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={file.url} target="_blank" rel="noopener" className="btn btn-sm btn-ghost">
                <ExternalLink size={14} aria-hidden="true" /> Öffnen
              </a>
              <a href={`${file.url}?download=1`} className="btn btn-sm btn-ghost">
                <Download size={14} aria-hidden="true" /> Herunterladen
              </a>
              {canRemove && (
                <button type="button" disabled={busy} onClick={() => onRemoveFile(file)} className="btn btn-sm btn-ghost text-danger">
                  Entfernen
                </button>
              )}
            </div>
          </div>
          <iframe
            src={file.url}
            title={file.originalName ?? 'Spielbericht'}
            className="mt-3 hidden h-[70vh] w-full rounded-sm border border-line bg-paper sm:block"
          />
        </div>
      ))}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((file, index) => (
            <li key={file.id} className="relative">
              <button
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="block aspect-square w-full overflow-hidden rounded-sm border border-line bg-surface"
                aria-label={`Bild ${index + 1} groß anzeigen`}
              >
                <img src={file.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
              {canRemove && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemoveFile(file)}
                  className="mt-1 w-full text-center text-xs text-danger"
                >
                  Entfernen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={images.map((f) => f.url)}
          startIndex={lightboxIndex}
          title={report.title}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
