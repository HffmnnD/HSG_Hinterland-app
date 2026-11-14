import { useMemo, useState } from 'react';
import { ExternalLink, FolderOpen, Pencil, Pin, Plus, Search, Trash2 } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApiResource } from '../../hooks/useSchedule';
import Modal from '../ui/Modal';
import FileList, { FilePicker } from '../ui/FileList';
import { useConfirm } from '../../hooks/useConfirm';
import { EmptyState, ErrorNote, Loading } from '../admin/ui/Feedback';

const select = (result) => ({ entries: result?.entries ?? [], canManage: Boolean(result?.canManage) });
const EMPTY = { entries: [], canManage: false };

// Vorschläge für die Rubrik – frei überschreibbar.
const CATEGORY_HINTS = {
  board: ['Anträge & Formulare', 'Hallenordnung', 'Hallenaufbau & Nutzung', 'Verein & Förderverein', 'Kontakte'],
};

const EMPTY_TEXT = {
  board: 'Noch keine Dokumente.',
};

/**
 * Dokumente unter Verein → Infos (scope `board`): Anträge, Hallenordnung &
 * Co. Wer pflegen darf, sagt das Backend (canManage).
 */
export default function LibrarySection({ scope = 'board' }) {
  const path = `/api/library/entries?scope=${scope}`;
  const { data, loading, error, reload } = useApiResource(path, select, EMPTY);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (neu) | Eintrag
  const [actionError, setActionError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const hits = data.entries.filter(
      (entry) =>
        !needle ||
        [entry.title, entry.body, entry.category, ...entry.files.map((file) => file.originalName)]
          .filter(Boolean)
          .some((text) => text.toLowerCase().includes(needle))
    );
    const pinned = hits.filter((entry) => entry.isPinned);
    const byCategory = new Map();
    for (const entry of hits.filter((item) => !item.isPinned)) {
      const key = entry.category ?? 'Allgemein';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(entry);
    }
    return [...(pinned.length > 0 ? [['Angeheftet', pinned]] : []), ...byCategory];
  }, [data.entries, search]);

  const run = async (action) => {
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const remove = async (entry) => {
    if (!(await confirm({ title: 'Eintrag löschen?', text: `„${entry.title}" wird samt Dateien entfernt.`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    await run(() => apiFetch(`/api/library/entries/${entry.id}`, { method: 'DELETE' }));
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {data.entries.length > 4 && (
          <label className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Suchen"
              aria-label="Einträge durchsuchen"
              className="field-control-sm w-full pl-9"
            />
          </label>
        )}
        {data.canManage && (
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing({})}>
            <Plus size={16} aria-hidden="true" /> Neuer Eintrag
          </button>
        )}
      </div>

      <ErrorNote>{actionError}</ErrorNote>

      {groups.length === 0 ? (
        <EmptyState icon={FolderOpen} title={search ? 'Keine Treffer' : EMPTY_TEXT[scope]} />
      ) : (
        groups.map(([category, entries]) => (
          <section key={category}>
            <h2 className="eyebrow mb-2">{category}</h2>
            <div className="space-y-3">
              {entries.map((entry) => (
                <article key={entry.id} className="panel">
                  <div className="panel__body space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="section-title flex items-center gap-1.5 text-base">
                          {entry.isPinned && <Pin size={14} aria-label="Angeheftet" className="shrink-0 text-hsg-green" />}
                          <span className="min-w-0 break-words">{entry.title}</span>
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Stand {formatDate(entry.updatedAt)}
                          {entry.author ? ` · ${entry.author}` : ''}
                        </p>
                      </div>
                      {data.canManage && (
                        <span className="flex shrink-0 gap-1">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(entry)} aria-label={`${entry.title} bearbeiten`}>
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => remove(entry)} aria-label={`${entry.title} löschen`}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </div>

                    {entry.body && <p className="whitespace-pre-line break-words text-sm text-ink-soft">{entry.body}</p>}

                    {entry.linkUrl && (
                      <a href={entry.linkUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                        <ExternalLink size={14} aria-hidden="true" /> {entry.linkLabel || 'Link öffnen'}
                      </a>
                    )}

                    <FileList files={entry.files} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      {editing && (
        <EntryDialog
          scope={scope}
          createPath={path.replace('/entries?', '/entries?')}
          entry={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function EntryDialog({ scope, createPath, entry, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    category: entry?.category ?? '',
    body: entry?.body ?? '',
    linkUrl: entry?.linkUrl ?? '',
    linkLabel: entry?.linkLabel ?? '',
    isPinned: entry?.isPinned ?? false,
  });
  const [files, setFiles] = useState([]);
  const [current, setCurrent] = useState(entry?.files ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) =>
    setForm((old) => ({ ...old, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (entry) {
        await apiFetch(`/api/library/entries/${entry.id}`, { method: 'PATCH', body: JSON.stringify(form) });
        if (files.length > 0) {
          const body = new FormData();
          files.forEach((file) => body.append('files', file));
          await apiFetch(`/api/library/entries/${entry.id}/files`, { method: 'POST', body });
        }
      } else {
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
        files.forEach((file) => body.append('files', file));
        await apiFetch(createPath, { method: 'POST', body });
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const removeFile = async (file) => {
    try {
      const result = await apiFetch(`/api/library/entries/${entry.id}/files/${file.id}`, { method: 'DELETE' });
      setCurrent(result.entry.files);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} size="lg" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="lib-title" className="field-label">Titel</label>
          <input id="lib-title" className="field-control" value={form.title} onChange={set('title')} maxLength={160} required />
        </div>
        <div>
          <label htmlFor="lib-category" className="field-label">Rubrik</label>
          <input id="lib-category" className="field-control" value={form.category} onChange={set('category')} maxLength={60} list="lib-categories" placeholder="z. B. Hallenordnung" />
          <datalist id="lib-categories">
            {CATEGORY_HINTS[scope].map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="lib-body" className="field-label">Text</label>
          <textarea id="lib-body" className="field-control" rows={6} value={form.body} onChange={set('body')} maxLength={20000} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="lib-link" className="field-label">Link</label>
            <input id="lib-link" className="field-control" value={form.linkUrl} onChange={set('linkUrl')} maxLength={500} placeholder="https://…" inputMode="url" />
          </div>
          <div>
            <label htmlFor="lib-link-label" className="field-label">Beschriftung des Links</label>
            <input id="lib-link-label" className="field-control" value={form.linkLabel} onChange={set('linkLabel')} maxLength={80} placeholder="z. B. Zum Formular" />
          </div>
        </div>

        {current.length > 0 && (
          <div>
            <p className="field-label">Vorhandene Dateien</p>
            <FileList files={current.map((file) => ({ ...file, kind: 'document' }))} onRemove={removeFile} />
          </div>
        )}
        <div>
          <label htmlFor="lib-files" className="field-label">Dateien anhängen</label>
          <FilePicker id="lib-files" files={files} onChange={setFiles} />
          <p className="field-hint">PDF, Bilder, Office-Dokumente und Videos.</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.isPinned} onChange={set('isPinned')} className="h-4 w-4 accent-[var(--c-green)]" />
          Oben anheften
        </label>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button>
        </div>
      </form>
    </Modal>
  );
}
