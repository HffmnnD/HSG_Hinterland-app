import { useEffect, useRef, useState } from 'react';

import { apiFetch } from '../lib/api';
import { useNews } from '../hooks/useNews';
import { formatDateTime } from '../lib/format';

// Müssen zu utils/validation.js im Backend passen.
const MAX_TITLE_LENGTH = 150;
const MAX_CONTENT_LENGTH = 5000;
const MAX_IMAGE_MB = 5;

/**
 * Verwaltung der Vereins-News (nur admin & sub_admin).
 *
 * Formular zum Veröffentlichen (Titel, Text, optionales Bild) und Liste aller
 * Beiträge mit zweistufigem Löschen. Das Backend räumt beim Löschen auch das
 * hochgeladene Bild weg.
 */
export default function NewsManager() {
  const { news, loading, error: loadError, reload } = useNews();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Zweistufiges Löschen: erst markieren, dann bestätigen.
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fileInputRef = useRef(null);

  // Die Vorschau-URL entsteht direkt bei der Auswahl (siehe selectImage).
  // Dieser Effekt gibt sie nur wieder frei – beim Bildwechsel und beim
  // Verlassen der Seite –, damit der Browser die Datei nicht festhält.
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearMessages = () => {
    setFormError(null);
    setNotice(null);
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    clearMessages();

    // Größe schon im Browser prüfen – spart einen sinnlosen Upload.
    if (file && file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFormError(`Das Bild darf höchstens ${MAX_IMAGE_MB} MB groß sein.`);
      event.target.value = '';
      selectImage(null);
      return;
    }
    selectImage(file);
  };

  const removeImage = () => {
    selectImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    clearMessages();

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
      await reload();
      setNotice(result?.message || 'Beitrag veröffentlicht.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    clearMessages();
    try {
      const result = await apiFetch(`/api/admin/news/${id}`, {
        method: 'DELETE',
      });
      setConfirmId(null);
      await reload();
      setNotice(result?.message || 'Beitrag gelöscht.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="section-title">Vereins-News &amp; Ankündigungen</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Beiträge erscheinen sofort auf dem Dashboard aller Mitglieder.
      </p>

      {notice && <div className="alert alert-success mt-4">{notice}</div>}
      {formError && (
        <div role="alert" className="alert alert-error mt-4">
          {formError}
        </div>
      )}

      {/* Neuer Beitrag */}
      <form onSubmit={handleSubmit} className="card-accent mt-4">
        <h3 className="section-title text-base">Neuen Beitrag veröffentlichen</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="news-title" className="field-label">
              Überschrift
            </label>
            <input
              id="news-title"
              className="field-control"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearMessages();
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
              onChange={(e) => {
                setContent(e.target.value);
                clearMessages();
              }}
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
            <span className="field-label">Bild (optional)</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-outline btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-hsg-green/40">
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
                  <span className="min-w-0 truncate text-xs text-ink-muted">
                    {image.name}
                  </span>
                  <button
                    type="button"
                    onClick={removeImage}
                    disabled={submitting}
                    className="btn btn-danger btn-sm"
                  >
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
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary btn-block mt-5 sm:w-auto"
        >
          {submitting ? 'Wird veröffentlicht …' : 'Beitrag veröffentlichen'}
        </button>
      </form>

      {/* Bestehende Beiträge */}
      <h3 className="eyebrow mt-8">Veröffentlichte Beiträge</h3>

      {loadError && (
        <div role="alert" className="alert alert-error mt-2">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="mt-2 text-sm text-ink-muted">Beiträge werden geladen …</p>
      ) : news.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Noch keine Beiträge veröffentlicht.
        </p>
      ) : (
        <ul className="list-panel mt-2">
          {news.map((item) => {
            const busy = deletingId === item.id;
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-12 w-16 shrink-0 rounded-sm border border-line bg-surface object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {formatDateTime(item.createdAt)}
                      {item.author &&
                        ` · ${item.author.firstName} ${item.author.lastName}`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  {confirmId === item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(item.id)}
                        className="btn btn-primary btn-sm"
                      >
                        {busy ? 'Löschen …' : 'Wirklich löschen'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(null)}
                        className="btn btn-outline btn-sm"
                      >
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setConfirmId(item.id);
                      }}
                      className="btn btn-danger btn-sm"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
