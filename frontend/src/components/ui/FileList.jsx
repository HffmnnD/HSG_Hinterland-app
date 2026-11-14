import { useState } from 'react';
import { Download, FileText, Film, Image as ImageIcon, Trash2 } from 'lucide-react';

import { getActAs } from '../../lib/api';
import { formatBytes } from '../../lib/format';

const ICONS = { image: ImageIcon, video: Film, pdf: FileText, document: FileText };

/**
 * Datei öffnen. Normalerweise ein gewöhnlicher Link (der Browser schickt den
 * Sitzungs-Cookie mit). Handeln Eltern gerade für ihr Kind, muss der Header
 * X-Act-As mit – den kann ein Link nicht setzen, also wird die Datei geladen
 * und aus dem Speicher geöffnet.
 */
async function openFile(event, url) {
  const actAs = getActAs();
  if (!actAs) return;
  event.preventDefault();
  const tab = window.open('', '_blank');
  try {
    const response = await fetch(url, { credentials: 'include', headers: { 'X-Act-As': String(actAs) } });
    if (!response.ok) throw new Error('Datei nicht verfügbar');
    const objectUrl = URL.createObjectURL(await response.blob());
    if (tab) tab.location = objectUrl;
    else window.location.assign(objectUrl);
  } catch {
    tab?.close();
    window.alert('Die Datei konnte nicht geöffnet werden.');
  }
}

/**
 * Anhänge eines Eintrags: Videos als Player, Bilder als Vorschau, alles andere
 * als Zeile mit Öffnen und Herunterladen.
 *
 * @param {{ files: {id:number, kind:string, originalName:string|null,
 *           sizeBytes:number, url:string}[],
 *           onRemove?: (file:object) => Promise<void>|void }} props
 */
export default function FileList({ files, onRemove }) {
  const [busy, setBusy] = useState(null);
  if (!files || files.length === 0) return null;

  const remove = async (file) => {
    setBusy(file.id);
    try {
      await onRemove(file);
    } finally {
      setBusy(null);
    }
  };

  const media = getActAs() ? [] : files.filter((file) => file.kind === 'video' || file.kind === 'image');

  return (
    <div className="space-y-3">
      {media.map((file) =>
        file.kind === 'video' ? (
          <video key={file.id} src={file.url} controls preload="metadata" className="w-full rounded-md border border-line bg-black" />
        ) : (
          <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block">
            <img src={file.url} alt={file.originalName ?? 'Bild'} loading="lazy" className="max-h-96 w-full rounded-md border border-line object-contain" />
          </a>
        )
      )}

      <ul className="divide-y divide-line rounded-md border border-line">
        {files.map((file) => {
          const Icon = ICONS[file.kind] ?? FileText;
          return (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2">
              <Icon size={18} aria-hidden="true" className="shrink-0 text-ink-muted" />
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => openFile(event, file.url)}
                className="min-w-0 flex-1 hover:text-hsg-green"
              >
                <span className="block truncate text-sm font-semibold text-ink">{file.originalName ?? 'Datei'}</span>
                <span className="block text-xs text-ink-muted">{formatBytes(file.sizeBytes)}</span>
              </a>
              <a
                href={`${file.url}?download=1`}
                onClick={(event) => openFile(event, `${file.url}?download=1`)}
                className="btn btn-ghost btn-sm shrink-0"
                aria-label={`${file.originalName ?? 'Datei'} herunterladen`}
              >
                <Download size={16} aria-hidden="true" />
              </a>
              {onRemove && (
                <button
                  type="button"
                  disabled={busy === file.id}
                  onClick={() => remove(file)}
                  className="btn btn-ghost btn-sm shrink-0 text-danger"
                  aria-label={`${file.originalName ?? 'Datei'} entfernen`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Auswahlfeld für Anhänge (mehrere Dateien). */
export function FilePicker({ id, files, onChange, accept }) {
  return (
    <div>
      <input
        id={id}
        type="file"
        multiple
        accept={accept ?? '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.txt,.csv,.mp4,.mov,.webm'}
        onChange={(event) => onChange([...event.target.files])}
        className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-sm file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
      />
      {files.length > 0 && (
        <p className="field-hint">
          {files.length} {files.length === 1 ? 'Datei' : 'Dateien'} ausgewählt
        </p>
      )}
    </div>
  );
}
