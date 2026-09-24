import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Newspaper,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAdminNews } from '../../hooks/useAdminNews';
import { formatDateTime } from '../../lib/format';
import Modal from '../ui/Modal';
import { EmptyState, ErrorNote, Loading, SuccessNote } from './ui/Feedback';

// Müssen zu utils/validation.js und config/uploads.js im Backend passen.
const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 5000;
const MAX_IMAGE_MB = 5;
// Feldname des Uploads – alle Bilder kommen unter demselben Namen, ihre
// Reihenfolge ist die Anzeigereihenfolge. Muss zu config/uploads.js passen.
const IMAGE_FIELD = 'images';
// Muss zu MAX_NEWS_IMAGES_PER_REQUEST im Backend passen. Die Zahl der Bilder
// je Beitrag ist im Datenmodell unbegrenzt; begrenzt ist nur der einzelne
// Upload (Lastabwehr).
const MAX_IMAGES_PER_UPLOAD = 20;

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

      <section className="panel">
        <div className="panel__header">
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
        <div className="panel__toolbar">
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
  // Beliebig viele Einträge: { id, file, previewUrl }. `id` ist der
  // React-Key – Dateiname und URL taugen dafür nicht, weil dieselbe Datei
  // zweimal ausgewählt werden darf.
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fileInput = useRef(null);
  const naechsteId = useRef(0);
  // Zweite Sicht auf denselben Zustand. Nötig, weil die Vorschau-URLs
  // AUSSERHALB des Renderns freigegeben werden müssen (siehe applyImages) und
  // dafür immer der aktuelle Stand gebraucht wird – auch in einem Aufruf, der
  // nicht auf ein Rendern gewartet hat.
  const imagesRef = useRef(images);

  /**
   * Setzt beide Sichten gemeinsam und gibt genau die Vorschau-URLs frei, die
   * dabei wegfallen.
   *
   * Warum nicht per Effekt mit `[images]`: Dessen Aufräumfunktion bekommt die
   * URLs des VORHERIGEN Zustands und gibt sie alle frei – auch die von
   * Bildern, die noch da sind. Beim Hinzufügen eines weiteren Bildes wurden so
   * die Vorschauen der vorherigen widerrufen. Verglichen wird über die
   * Objektidentität: was im neuen Zustand noch vorkommt, behält seine URL.
   */
  const applyImages = (next) => {
    imagesRef.current.forEach((entry) => {
      if (!next.includes(entry)) URL.revokeObjectURL(entry.previewUrl);
    });
    imagesRef.current = next;
    setImages(next);
  };

  /** Alle Bilder verwerfen und ihre Vorschau-URLs freigeben. */
  const clearImages = () => applyImages([]);

  // Letztes Netz: Wird das Formular abgeräumt (Reiterwechsel), während noch
  // Bilder gewählt sind, blieben deren URLs sonst bis zum Neuladen der Seite
  // bestehen.
  useEffect(
    () => () => {
      imagesRef.current.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    },
    []
  );

  /**
   * Ausgewählte Dateien anhängen.
   *
   * `URL.createObjectURL` steht bewusst HIER und nicht in einem
   * `setImages(prev => …)`-Updater: Updater müssen frei von Seiteneffekten
   * sein. React ruft sie unter StrictMode doppelt auf – es entstünden doppelt
   * so viele URLs, von denen die Hälfte nie freigegeben würde.
   */
  const handleImageChange = (event) => {
    const gewaehlt = [...(event.target.files ?? [])];
    // Das Feld sofort leeren: sonst löst dieselbe Datei beim nächsten Mal kein
    // `change` aus, und Anhängen wäre nur einmal möglich.
    event.target.value = '';
    setFormError(null);
    if (gewaehlt.length === 0) return;

    const zuGross = gewaehlt.filter(
      (file) => file.size > MAX_IMAGE_MB * 1024 * 1024
    );
    const passend = gewaehlt.filter(
      (file) => file.size <= MAX_IMAGE_MB * 1024 * 1024
    );

    const frei = MAX_IMAGES_PER_UPLOAD - imagesRef.current.length;
    const angenommen = passend.slice(0, Math.max(0, frei));

    // Ehrlich melden, was NICHT übernommen wurde – stillschweigend Dateien zu
    // schlucken ist die schlechteste Variante.
    const hinweise = [];
    if (zuGross.length > 0) {
      hinweise.push(
        `${zuGross.length} ${zuGross.length === 1 ? 'Bild ist' : 'Bilder sind'} größer als ${MAX_IMAGE_MB} MB und ${zuGross.length === 1 ? 'wurde' : 'wurden'} nicht übernommen.`
      );
    }
    if (passend.length > angenommen.length) {
      hinweise.push(
        `Höchstens ${MAX_IMAGES_PER_UPLOAD} Bilder je Beitrag – ${passend.length - angenommen.length} davon ${passend.length - angenommen.length === 1 ? 'wurde' : 'wurden'} nicht übernommen.`
      );
    }
    if (hinweise.length > 0) setFormError(hinweise.join(' '));

    if (angenommen.length === 0) return;

    applyImages([
      ...imagesRef.current,
      ...angenommen.map((file) => {
        naechsteId.current += 1;
        return {
          id: naechsteId.current,
          file,
          previewUrl: URL.createObjectURL(file),
        };
      }),
    ]);
  };

  /** Ein Bild aus der Strecke nehmen. */
  const removeImage = (id) => {
    applyImages(imagesRef.current.filter((entry) => entry.id !== id));
    setFormError(null);
  };

  /** Ein Bild um eine Position verschieben (Reihenfolge = Anzeigereihenfolge). */
  const moveImage = (id, richtung) => {
    const aktuell = imagesRef.current;
    const von = aktuell.findIndex((entry) => entry.id === id);
    const nach = von + richtung;
    if (von < 0 || nach < 0 || nach >= aktuell.length) return;

    const next = [...aktuell];
    [next[von], next[nach]] = [next[nach], next[von]];
    applyImages(next);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    clearImages();
    setFormError(null);
    if (fileInput.current) fileInput.current.value = '';
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
    // Reihenfolge im FormData = Reihenfolge im Beitrag.
    images.forEach((entry) => body.append(IMAGE_FIELD, entry.file));

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
          <div className="flex items-baseline justify-between gap-2">
            <span className="field-label mb-0">Bilder (optional)</span>
            {images.length > 0 && (
              <span className="text-xs text-ink-muted">
                {images.length} von {MAX_IMAGES_PER_UPLOAD}
              </span>
            )}
          </div>

          {images.length > 0 && (
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((entry, index) => (
                <ImageThumb
                  key={entry.id}
                  entry={entry}
                  index={index}
                  gesamt={images.length}
                  disabled={submitting}
                  onRemove={() => removeImage(entry.id)}
                  onMove={(richtung) => moveImage(entry.id, richtung)}
                />
              ))}
            </ul>
          )}

          {images.length < MAX_IMAGES_PER_UPLOAD && (
            <label
              className={`mt-2 flex min-h-11 cursor-pointer items-center justify-center gap-2
                rounded-sm border border-dashed border-line-strong bg-surface px-3 py-3
                text-sm font-semibold text-ink-muted transition-colors
                hover:border-hsg-green hover:text-hsg-green-dark
                focus-within:ring-2 focus-within:ring-hsg-green/40
                ${submitting ? 'pointer-events-none opacity-55' : ''}`}
            >
              <ImagePlus size={16} aria-hidden="true" />
              {images.length === 0 ? 'Bilder auswählen' : 'Weitere Bilder hinzufügen'}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="sr-only"
                onChange={handleImageChange}
                disabled={submitting}
              />
            </label>
          )}

          <p className="field-hint">
            Mehrfachauswahl möglich · JPG, PNG, WEBP oder GIF · je max.{' '}
            {MAX_IMAGE_MB} MB · die Reihenfolge hier ist die Reihenfolge im
            Beitrag
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
 * Eine Kachel der Bilderstrecke im Formular: Vorschau, Entfernen-Knopf und
 * zwei Pfeile zum Umsortieren.
 *
 * Die Pfeile statt Ziehen-und-Ablegen: Drag & Drop müsste für Maus, Touch und
 * Tastatur getrennt gebaut werden und wäre ohne Bibliothek deutlich mehr Code,
 * als diese Aufgabe wert ist. Zwei Knöpfe funktionieren überall gleich.
 */
function ImageThumb({ entry, index, gesamt, disabled, onRemove, onMove }) {
  return (
    <li className="relative">
      <img
        src={entry.previewUrl}
        alt={`Vorschau ${index + 1} von ${gesamt}`}
        className="w-full rounded-sm border border-line bg-surface object-cover"
        style={{ aspectRatio: '4 / 3' }}
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Bild ${index + 1} entfernen`}
        title="Bild entfernen"
        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center
          rounded-sm border border-line-strong bg-paper/90 text-ink-muted backdrop-blur
          transition-colors hover:border-danger hover:text-danger"
      >
        <X size={14} aria-hidden="true" />
      </button>

      {gesamt > 1 && (
        <div className="absolute bottom-1.5 left-1.5 flex gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={disabled || index === 0}
            aria-label={`Bild ${index + 1} nach vorne`}
            title="Nach vorne"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border
              border-line-strong bg-paper/90 text-ink-soft backdrop-blur transition-colors
              hover:border-hsg-green hover:text-hsg-green-dark
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={disabled || index === gesamt - 1}
            aria-label={`Bild ${index + 1} nach hinten`}
            title="Nach hinten"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border
              border-line-strong bg-paper/90 text-ink-soft backdrop-blur transition-colors
              hover:border-hsg-green hover:text-hsg-green-dark
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="mt-1 truncate text-xs text-ink-muted" title={entry.file.name}>
        {entry.file.name}
      </p>
    </li>
  );
}
