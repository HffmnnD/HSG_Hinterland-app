import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Schlichter Dialog für Formulare (z. B. „Neue Mannschaft anlegen").
 *
 * Bewusst kein <dialog>: Safari auf iOS unterstützt `showModal()` erst seit
 * Kurzem, und die App läuft als PWA auch auf älteren Geräten. Stattdessen ein
 * eigenes Overlay mit den drei Dingen, die einen Dialog ausmachen:
 *
 *   1. Escape schließt.
 *   2. Klick auf den Hintergrund schließt (Klick INNERHALB nicht).
 *   3. Der Fokus springt beim Öffnen hinein und die Seite dahinter scrollt
 *      nicht mit.
 *
 * @param {boolean}    open
 * @param {() => void} onClose
 * @param {string}     title
 * @param {string}     [description]
 */
export default function Modal({ open, onClose, title, description, children }) {
  const panelRef = useRef(null);

  // Escape schließen + Hintergrund festhalten, solange der Dialog offen ist.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Fokus in den Dialog holen – sonst tabbt man in die Seite dahinter.
    const firstField = panelRef.current?.querySelector(
      'input, select, textarea, button'
    );
    firstField?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      // Nur ein Klick auf den Hintergrund selbst schließt; ein Klick im
      // Formular blubbert zwar hierher, hat dann aber ein anderes `target`.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-panel"
      >
        <div className="modal-header">
          <div className="min-w-0">
            <h2 className="section-title text-base">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-ink-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="btn btn-ghost btn-sm -mr-2 -mt-1 shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
