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

// Müssen zu utils/validation.js und config/uploads.js im Backend passen.
const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 5000;
const MAX_IMAGE_MB = 5;
// Zwei Bilder je Beitrag – das Schwarze Brett ist keine Galerie.
const IMAGE_SLOTS = [
  { field: 'image', label: 'Erstes Bild' },
  { field: 'image2', label: 'Zweites Bild' },
];

/**
 * News-Verwaltung mit Archiv.
 *
 * Beiträge werden ARCHIVIERT, nicht gelöscht: sie verschwinden aus dem Feed,
 * bleiben aber unter „Archiv" vollständig erhalten und lassen sich mit einem
 * Klick zurückholen. Ein versehentliches Wegräumen kostet damit nichts mehr.
 *
 * Endgültiges Löschen gibt es weiterhin – aber nur aus dem Archiv heraus und
 * mit Rückfrage im Dialog. Nur dabei werden auch die Bilder frei.
 *
 * Zum Aufbau: eine Karte, ein Umschalter, eine Liste. Die Zeilen tragen nur
 * Bild, Titel und Datumszeile – die Aktionen sind Symbolknöpfe fester Breite
 * am rechten Rand, die die Zeile nicht umbrechen lassen.
 */
export default function NewsSection() {
  const [view, setView] = useState('active');
  const { news, counts, loading, error, setError, reload } = useAdminNews(view);

  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // Beitrag, für den die Löschabfrage offen ist (null = keine).
  const [pendingDelete, setPendingDelete] = useState(null);

  const isArchive = view === 'archived';

  /**
   * Beim Umschalten die Meldung wegräumen: „Beitrag archiviert" über einer
   * Archivliste zu lassen, in der er nun steht, stiftet mehr Verwirrung als
   * Nutzen – die Meldung gehörte zur vorherigen Ansicht.
   */
  const showView = (next) => {
    setView(next);
    setNotice(null);
    setPendingDelete(null);
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
  const remove = async (item) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch(`/api/admin/news/${item.id}`, {
        method: 'DELETE',
      });
      setPendingDelete(null);
      await reload();
      setNotice(result?.message ?? 'Beitrag gelöscht.');
    } catch (err) {
      setPendingDelete(null);
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

        {/* Umschalter zwischen Feed und Archiv. Die Zählerstände stehen an den
            Knöpfen – ein erklärender Fließtext daneben wäre nur Rauschen. */}
        <div className="admin-toolbar">
          <div className="switcher">
            <button
              type="button"
              onClick={() => showView('active')}
              aria-pressed={!isArchive}
              className={`switcher__btn ${!isArchive ? 'switcher__btn--active' : ''}`}
            >
              <Newspaper size={14} aria-hidden="true" />
              Aktiv ({counts.active})
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
                onArchive={() => setArchived(item.id, true)}
                onRestore={() => setArchived(item.id, false)}
                onAskDelete={() => {
                  setNotice(null);
                  setPendingDelete(item);
                }}
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

      <ConfirmDelete
        item={pendingDelete}
        busy={pendingDelete ? busyId === pendingDelete.id : false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => remove(pendingDelete)}
      />
    </div>
  );
}

/**
 * Eine Zeile der Beitragsliste.
 *
 * Die Aktionen sind Symbolknöpfe fester Breite. Beschriftete Knöpfe ließen die
 * Zeile je nach Zustand („Archivieren" vs. „Zurückholen" + „Löschen")
 * unterschiedlich breit werden und auf dem Handy umbrechen – die Liste wirkte
 * dadurch unruhig. Der Zweck steht in `title` und `aria-label`.
 */
function NewsRow({ item, busy, onArchive, onRestore, onAskDelete }) {
  const images = item.imageUrls ?? (item.imageUrl ? [item.imageUrl] : []);

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <NewsThumb images={images} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{item.title}</p>
        <p className="truncate text-xs text-ink-muted">
          {formatDateTime(item.createdAt)}
          {item.author && ` · ${item.author.firstName} ${item.author.lastName}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.isArchived ? (
          <>
            <IconButton
              onClick={onRestore}
              disabled={busy}
              label="Beitrag zurückholen"
              title="Wieder im Feed anzeigen"
              icon={ArchiveRestore}
            />
            <IconButton
              onClick={onAskDelete}
              disabled={busy}
              label="Beitrag endgültig löschen"
              title="Beitrag und Bilder unwiderruflich entfernen"
              icon={Trash2}
              tone="danger"
            />
          </>
        ) : (
          <IconButton
            onClick={onArchive}
            disabled={busy}
            label="Beitrag archivieren"
            title="Aus dem Feed nehmen – bleibt im Archiv erhalten"
            icon={Archive}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Vorschaubild einer Zeile. Bei zwei Bildern liegt ein zweites Blatt leicht
 * versetzt dahinter – so ist auf einen Blick zu sehen, dass der Beitrag zwei
 * Bilder trägt, ohne dass die Zeile breiter wird.
 */
function NewsThumb({ images }) {
  if (images.length === 0) {
    return (
      <span
        aria-hidden="true"
        className="flex h-11 w-14 shrink-0 items-center justify-center rounded-sm
          border border-dashed border-line-strong bg-surface text-ink-muted"
      >
        <Newspaper size={15} />
      </span>
    );
  }

  return (
    <span className="relative block h-11 w-14 shrink-0">
      {images.length > 1 && (
        <span
          aria-hidden="true"
          className="absolute right-0 top-0 h-11 w-14 -translate-y-1 translate-x-1
            rounded-sm border border-line bg-surface-strong"
        />
      )}
      <img
        src={images[0]}
        alt=""
        loading="lazy"
        className="relative h-11 w-14 rounded-sm border border-line bg-surface object-cover"
      />
      {images.length > 1 && <span className="sr-only">{images.length} Bilder</span>}
    </span>
  );
}

/** Quadratischer Symbolknopf für Zeilenaktionen. */
function IconButton({ onClick, disabled, label, title, icon: Icon, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-sm border
        border-line-strong bg-paper transition-colors disabled:cursor-not-allowed
        disabled:opacity-45 ${
          tone === 'danger'
            ? 'text-ink-muted hover:border-danger hover:text-danger'
            : 'text-ink-soft hover:border-hsg-green hover:text-hsg-green-dark'
        }`}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

/**
 * Rückfrage vor dem endgültigen Löschen.
 *
 * Als Dialog und nicht als aufklappende Zeile: die Zeile wechselte dabei ihre
 * Höhe und schob die halbe Liste weg. Der Dialog nennt außerdem den Titel des
 * Beitrags – bei „Wirklich löschen?" in einer langen Liste ist sonst nicht
 * sicher, welcher Beitrag gemeint ist.
 */
function ConfirmDelete({ item, busy, onCancel, onConfirm }) {
  return (
    <Modal
      open={Boolean(item)}
      onClose={() => {
        if (!busy) onCancel();
      }}
      title="Beitrag endgültig löschen?"
      size="sm"
    >
      <p className="text-sm text-ink-soft">
        <span className="font-bold text-ink">{item?.title}</span> wird samt
        Bildern unwiderruflich entfernt. Zum Aufheben genügt sonst das Archiv.
      </p>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn btn-outline"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="btn btn-danger"
        >
          <Trash2 size={15} aria-hidden="true" />
          {busy ? 'Wird gelöscht …' : 'Endgültig löschen'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Formular für einen neuen Beitrag.
 *
 * Zum Fokus-Problem: Die Komponente steht auf MODULEBENE, nicht im Rumpf von
 * NewsSection. Eine im Rumpf definierte Komponente ist bei jedem Rendern ein
 * neuer Typ – React verwirft den Teilbaum und baut ihn neu auf, wodurch das
 * Eingabefeld nach jedem Buchstaben den Fokus verliert. Die zweite Ursache
 * desselben Fehlers lag im Dialog selbst (siehe Kommentar in ui/Modal.jsx).
 */
function NewsComposer({ open, onClose, onPublished }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // Ein Eintrag je Bildplatz: { file, previewUrl } oder null.
  const [images, setImages] = useState([null, null]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fileInputs = useRef([]);

  // Die Vorschau-URLs entstehen direkt bei der Auswahl. Dieser Effekt gibt sie
  // nur wieder frei – beim Bildwechsel und beim Schließen –, damit der Browser
  // die Dateien nicht festhält.
  useEffect(() => {
    const urls = images.map((entry) => entry?.previewUrl).filter(Boolean);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  /** Bild an Platz `index` setzen oder entfernen (`file = null`). */
  const setImage = (index, file) => {
    setImages((prev) => {
      const next = [...prev];
      next[index] = file ? { file, previewUrl: URL.createObjectURL(file) } : null;
      return next;
    });
  };

  const handleImageChange = (index) => (event) => {
    const file = event.target.files?.[0] ?? null;
    setFormError(null);

    // Größe schon im Browser prüfen – spart einen sinnlosen Upload.
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFormError(`Jedes Bild darf höchstens ${MAX_IMAGE_MB} MB groß sein.`);
      event.target.value = '';
      setImage(index, null);
      return;
    }
    setImage(index, file);
  };

  const removeImage = (index) => {
    setImage(index, null);
    const input = fileInputs.current[index];
    if (input) input.value = '';
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setImages([null, null]);
    setFormError(null);
    fileInputs.current.forEach((input) => {
      if (input) input.value = '';
    });
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
    images.forEach((entry, index) => {
      if (entry) body.append(IMAGE_SLOTS[index].field, entry.file);
    });

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
            onChange={(event) => setTitle(event.target.value)}
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
            onChange={(event) => setContent(event.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder="Was gibt es zu berichten?"
            disabled={submitting}
            required
          />
          <p className="field-hint">
            {content.length} / {MAX_CONTENT_LENGTH} Zeichen · Zeilenumbrüche
            bleiben erhalten.
          </p>
        </div>

        <div>
          <span className="field-label">Bilder (optional)</span>
          <div className="grid grid-cols-2 gap-3">
            {IMAGE_SLOTS.map((slot, index) => (
              <ImageSlot
                key={slot.field}
                label={slot.label}
                entry={images[index]}
                disabled={submitting}
                inputRef={(element) => {
                  fileInputs.current[index] = element;
                }}
                onChange={handleImageChange(index)}
                onRemove={() => removeImage(index)}
              />
            ))}
          </div>
          <p className="field-hint">
            Bis zu zwei Bilder · JPG, PNG, WEBP oder GIF · je max. {MAX_IMAGE_MB}{' '}
            MB
          </p>
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

/**
 * Ein Bildplatz: leer eine gestrichelte Auswahlfläche, belegt die Vorschau mit
 * Entfernen-Knopf. Beide sind gleich groß (16:9), damit das Formular beim
 * Auswählen eines Bildes nicht springt.
 */
function ImageSlot({ label, entry, disabled, inputRef, onChange, onRemove }) {
  if (entry) {
    return (
      <div className="relative">
        <img
          src={entry.previewUrl}
          alt={`Vorschau: ${label}`}
          className="w-full rounded-sm border border-line bg-surface object-cover"
          style={{ aspectRatio: '16 / 9' }}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${label} entfernen`}
          title="Bild entfernen"
          className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center
            rounded-sm border border-line-strong bg-paper/90 text-ink-muted backdrop-blur
            transition-colors hover:border-danger hover:text-danger"
        >
          <X size={14} aria-hidden="true" />
        </button>
        <p className="mt-1 truncate text-xs text-ink-muted" title={entry.file.name}>
          {entry.file.name}
        </p>
      </div>
    );
  }

  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5
        rounded-sm border border-dashed border-line-strong bg-surface text-ink-muted
        transition-colors hover:border-hsg-green hover:text-hsg-green-dark
        focus-within:ring-2 focus-within:ring-hsg-green/40
        ${disabled ? 'pointer-events-none opacity-55' : ''}`}
      style={{ aspectRatio: '16 / 9' }}
    >
      <ImagePlus size={18} aria-hidden="true" />
      <span className="text-xs font-semibold">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}
