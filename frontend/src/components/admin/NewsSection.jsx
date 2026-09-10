import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ImagePlus,
  Newspaper,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAdminNews } from '../../hooks/useAdminNews';
import { formatDateTime } from '../../lib/format';
import Modal from './ui/Modal';
import { EmptyState, ErrorNote, Loading, SuccessNote } from './ui/Feedback';

// Müssen zu utils/validation.js im Backend passen.
const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 5000;
const MAX_IMAGE_MB = 5;

/**
 * News-Verwaltung mit Archiv.
 *
 * Beiträge werden ARCHIVIERT, nicht gelöscht: sie verschwinden aus dem Feed,
 * bleiben aber unter „Archiv" vollständig erhalten und lassen sich mit einem
 * Klick zurückholen. Ein versehentliches Wegräumen kostet damit nichts mehr.
 *
 * Endgültiges Löschen gibt es weiterhin – aber nur aus dem Archiv heraus und
 * mit Rückfrage. Nur dabei wird auch das hochgeladene Bild frei.
 */
export default function NewsSection() {
  const [view, setView] = useState('active');
  const { news, counts, loading, error, setError, reload } = useAdminNews(view);

  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const isArchive = view === 'archived';

  /**
   * Beim Umschalten die Meldung wegräumen: „Beitrag archiviert" über einer
   * Archivliste zu lassen, in der er nun steht, stiftet mehr Verwirrung als
   * Nutzen – die Meldung gehörte zur vorherigen Ansicht.
   */
  const showView = (next) => {
    setView(next);
    setNotice(null);
    setConfirmDeleteId(null);
  };

  /** Archivieren oder zurückholen. */
  const setArchived = async (id, isArchived) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch(`/api/admin/news/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived }),
      });
      await reload();
      setNotice(result?.message ?? 'Beitrag aktualisiert.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  /** Endgültig löschen (nur aus dem Archiv). */
  const remove = async (id) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch(`/api/admin/news/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      await reload();
      setNotice(result?.message ?? 'Beitrag gelöscht.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="admin-card">
        <div className="admin-card__header">
          <div className="min-w-0">
            <h2 className="section-title text-base">Vereins-News</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Aktive Beiträge erscheinen auf dem Dashboard aller Mitglieder.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setComposerOpen(true);
            }}
            className="btn btn-primary btn-sm"
          >
            <Plus size={15} aria-hidden="true" />
            Neuer Beitrag
          </button>
        </div>

        {/* Umschalter zwischen Feed und Archiv */}
        <div className="admin-toolbar">
          <div className="switcher">
            <button
              type="button"
              onClick={() => showView('active')}
              aria-pressed={view === 'active'}
              className={`switcher__btn ${view === 'active' ? 'switcher__btn--active' : ''}`}
            >
              <Newspaper size={14} aria-hidden="true" />
              Aktive News ({counts.active})
            </button>
            <button
              type="button"
              onClick={() => showView('archived')}
              aria-pressed={isArchive}
              className={`switcher__btn ${isArchive ? 'switcher__btn--active' : ''}`}
            >
              <Archive size={14} aria-hidden="true" />
              Archiv ({counts.archived})
            </button>
          </div>

          <p className="text-xs text-ink-muted sm:ml-auto">
            {isArchive
              ? 'Archivierte Beiträge sind im Feed unsichtbar, bleiben aber erhalten.'
              : 'Archivieren nimmt einen Beitrag aus dem Feed – ohne ihn zu verlieren.'}
          </p>
        </div>

        {loading ? (
          <Loading>Beiträge werden geladen …</Loading>
        ) : news.length === 0 ? (
          <EmptyState
            icon={isArchive ? Archive : Newspaper}
            title={isArchive ? 'Archiv ist leer' : 'Noch keine Beiträge'}
            hint={
              isArchive
                ? 'Hier landen Beiträge, die du aus dem Feed genommen hast.'
                : 'Veröffentliche den ersten Beitrag – er erscheint sofort auf dem Dashboard.'
            }
          >
            {!isArchive && (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="btn btn-primary btn-sm mt-2"
              >
                <Plus size={15} aria-hidden="true" />
                Neuer Beitrag
              </button>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {news.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                confirmingDelete={confirmDeleteId === item.id}
                onArchive={() => setArchived(item.id, true)}
                onRestore={() => setArchived(item.id, false)}
                onAskDelete={() => {
                  setNotice(null);
                  setConfirmDeleteId(item.id);
                }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={() => remove(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <NewsComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={async (message) => {
          setComposerOpen(false);
          // Aus dem Archiv heraus veröffentlicht: der Wechsel auf „Aktiv"
          // löst das Laden selbst aus. Steht die aktive Liste schon offen,
          // ändert sich der Status nicht – dann muss sie hier nachgeholt
          // werden, sonst fehlt der neue Beitrag.
          if (isArchive) showView('active');
          else await reload();
          setNotice(message);
        }}
      />
    </div>
  );
}

/** Eine Zeile der Beitragsliste. */
function NewsRow({
  item,
  busy,
  confirmingDelete,
  onArchive,
  onRestore,
  onAskDelete,
  onCancelDelete,
  onDelete,
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="h-12 w-16 shrink-0 rounded-sm border border-line bg-surface object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-12 w-16 shrink-0 items-center justify-center rounded-sm
              border border-dashed border-line-strong bg-surface text-ink-muted"
          >
            <Newspaper size={16} />
          </span>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{item.title}</p>
          <p className="truncate text-xs text-ink-muted">
            {formatDateTime(item.createdAt)}
            {item.author && ` · ${item.author.firstName} ${item.author.lastName}`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {confirmingDelete ? (
          <>
            <span className="self-center text-xs font-semibold text-danger">
              Endgültig löschen?
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="btn btn-danger btn-sm"
            >
              {busy ? 'Löschen …' : 'Ja, löschen'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancelDelete}
              className="btn btn-outline btn-sm"
            >
              Abbrechen
            </button>
          </>
        ) : item.isArchived ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onRestore}
              className="btn btn-outline btn-sm"
              title="Beitrag wieder im Feed anzeigen"
            >
              <ArchiveRestore size={14} aria-hidden="true" />
              {busy ? '…' : 'Zurückholen'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onAskDelete}
              className="btn btn-danger btn-sm"
              title="Beitrag und Bild unwiderruflich entfernen"
            >
              <Trash2 size={14} aria-hidden="true" />
              Löschen
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onArchive}
            className="btn btn-outline btn-sm"
            title="Beitrag aus dem Feed nehmen – er bleibt im Archiv erhalten"
          >
            <Archive size={14} aria-hidden="true" />
            {busy ? '…' : 'Archivieren'}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Formular für einen neuen Beitrag – im Dialog, damit die Liste die Seite
 * beherrscht und nicht ein Formular, das man meistens gar nicht braucht.
 */
function NewsComposer({ open, onClose, onPublished }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fileInputRef = useRef(null);

  // Die Vorschau-URL entsteht direkt bei der Auswahl (siehe selectImage).
  // Dieser Effekt gibt sie nur wieder frei – beim Bildwechsel und beim
  // Schließen –, damit der Browser die Datei nicht festhält.
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  /** Setzt Datei und Vorschau gemeinsam (null = kein Bild). */
  const selectImage = (file) => {
    setImage(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    selectImage(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setFormError(null);

    // Größe schon im Browser prüfen – spart einen sinnlosen Upload.
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFormError(`Das Bild darf höchstens ${MAX_IMAGE_MB} MB groß sein.`);
      event.target.value = '';
      selectImage(null);
      return;
    }
    selectImage(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    if (!title.trim() || !content.trim()) {
      setFormError('Bitte Überschrift und Nachrichtentext ausfüllen.');
      return;
    }

    // multipart/form-data: apiFetch setzt bei FormData bewusst keinen
    // Content-Type, damit der Browser die Boundary ergänzt.
    const body = new FormData();
    body.append('title', title.trim());
    body.append('content', content.trim());
    if (image) body.append('image', image);

    setSubmitting(true);
    try {
      const result = await apiFetch('/api/admin/news', { method: 'POST', body });
      resetForm();
      await onPublished(result?.message || 'Beitrag veröffentlicht.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Neuen Beitrag veröffentlichen"
      description="Erscheint sofort auf dem Dashboard aller Mitglieder."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <ErrorNote>{formError}</ErrorNote>}

        <div>
          <label htmlFor="news-title" className="field-label">
            Überschrift
          </label>
          <input
            id="news-title"
            className="field-control"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setFormError(null);
            }}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="z. B. Heimspiel-Wochenende in der Hinterlandhalle"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="news-content" className="field-label">
            Nachrichtentext
          </label>
          <textarea
            id="news-content"
            className="field-control resize-y"
            rows={6}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setFormError(null);
            }}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder="Was gibt es zu berichten?"
            disabled={submitting}
            required
          />
          <p className="field-hint">
            {content.length} / {MAX_CONTENT_LENGTH} Zeichen · Zeilenumbrüche bleiben
            erhalten.
          </p>
        </div>

        <div>
          <span className="field-label">Bild (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn btn-outline btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-hsg-green/40">
              <ImagePlus size={14} aria-hidden="true" />
              {image ? 'Anderes Bild' : 'Bild wählen'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={handleImageChange}
                disabled={submitting}
              />
            </label>

            {image ? (
              <>
                <span className="min-w-0 truncate text-xs text-ink-muted">{image.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    selectImage(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={submitting}
                  className="btn btn-danger btn-sm"
                >
                  <X size={14} aria-hidden="true" />
                  Entfernen
                </button>
              </>
            ) : (
              <span className="text-xs text-ink-muted">
                JPG, PNG, WEBP oder GIF · max. {MAX_IMAGE_MB} MB
              </span>
            )}
          </div>

          {previewUrl && (
            <img
              src={previewUrl}
              alt="Vorschau des gewählten Beitragsbilds"
              className="news-image mt-3"
            />
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="btn btn-outline"
          >
            Abbrechen
          </button>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? 'Wird veröffentlicht …' : 'Veröffentlichen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
