import { useEffect, useRef } from 'react';

/**
 * Rückfrage-Dialog, der über dem Inhalt liegt.
 *
 * Ersetzt die früheren Hinweiskästen am Seitenanfang: Wer weit unten in einer
 * langen Terminliste auf „Löschen" tippt, sieht einen Kasten ganz oben nicht –
 * die Aktion wirkte dann wie ohne Rückmeldung verpufft.
 *
 * Auf dem Handy von unten eingeblendet (Daumenreichweite), ab `sm` mittig.
 * Schließt per Escape und per Klick auf die Abdunklung; der Fokus springt
 * beim Öffnen in den Dialog, damit die Tastaturbedienung nicht hinter ihm
 * hängen bleibt.
 *
 * @param {{ title: string, onClose: () => void, children: React.ReactNode }} props
 */
export default function Modal({ title, onClose, children }) {
  const cardRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Hintergrund nicht mitscrollen lassen, solange der Dialog offen ist.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    cardRef.current?.querySelector('button, input, textarea')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      // Nur ein Klick auf die Fläche SELBST schließt – nicht einer, der im
      // Dialog begann und beim Loslassen daneben landete.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-card"
      >
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
