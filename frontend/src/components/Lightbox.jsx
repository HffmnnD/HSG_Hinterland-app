import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Vollbild-Betrachter für Beitragsbilder.
 *
 * Bewusst kein <dialog> und keine Bibliothek: gebraucht werden genau vier
 * Dinge, und die sind hier komplett zu sehen.
 *
 *   1. Escape schließt, Pfeiltasten blättern.
 *   2. Klick auf die Fläche schließt, Klick auf das Bild nicht.
 *   3. Die Seite dahinter scrollt nicht mit.
 *   4. Der Fokus geht hinein und beim Schließen dorthin zurück, wo er herkam –
 *      sonst steht man nach dem Schließen am Seitenanfang.
 *
 * Der Index wird HIER gehalten, nicht in der aufrufenden Komponente: Blättern
 * ist eine Sache des Betrachters. Die Karte sagt nur, welches Bild angeklickt
 * wurde (`startIndex`).
 *
 * @param {string[]} images    URLs in Anzeigereihenfolge
 * @param {number}   startIndex
 * @param {() => void} onClose
 * @param {string}   [title]   Beitragstitel für die Beschriftung
 */
export default function Lightbox({ images, startIndex = 0, onClose, title }) {
  const [index, setIndex] = useState(startIndex);
  const closeRef = useRef(null);
  // Element, das den Fokus hatte, bevor der Betrachter aufging.
  const rueckkehrRef = useRef(null);

  const anzahl = images.length;

  // Umlaufend blättern: am Ende geht es vorne weiter. Bei nur einem Bild
  // passiert nichts.
  const blaettern = useCallback(
    (schritt) => {
      if (anzahl < 2) return;
      setIndex((aktuell) => (aktuell + schritt + anzahl) % anzahl);
    },
    [anzahl]
  );

  useEffect(() => {
    rueckkehrRef.current = document.activeElement;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') blaettern(1);
      else if (event.key === 'ArrowLeft') blaettern(-1);
    };
    document.addEventListener('keydown', onKeyDown);

    const vorherigesOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = vorherigesOverflow;
      // Nur zurückgeben, wenn das Element noch im Dokument hängt.
      const ziel = rueckkehrRef.current;
      if (ziel instanceof HTMLElement && document.contains(ziel)) ziel.focus();
    };
    // `onClose` und `blaettern` sind über useCallback bzw. den Aufrufer stabil
    // genug; entscheidend ist, dass dieser Effekt nur beim Öffnen und
    // Schließen läuft und den Fokus nicht bei jedem Rendern neu setzt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aktuelle = images[index];
  if (!aktuelle) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Bild aus „${title}"` : 'Bild in voller Größe'}
      onMouseDown={(event) => {
        // Nur ein Klick auf die Fläche selbst schließt – nicht einer, der im
        // Bild oder auf einem Knopf begonnen hat.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lightbox__bar">
        {anzahl > 1 && (
          <span className="lightbox__counter" aria-live="polite">
            {index + 1} / {anzahl}
          </span>
        )}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Vollbild schließen"
          className="lightbox__btn ml-auto"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {anzahl > 1 && (
        <button
          type="button"
          onClick={() => blaettern(-1)}
          aria-label="Vorheriges Bild"
          className="lightbox__btn lightbox__nav lightbox__nav--prev"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
      )}

      <img
        src={aktuelle}
        alt={
          title
            ? `Bild ${index + 1} von ${anzahl} aus „${title}"`
            : `Bild ${index + 1} von ${anzahl}`
        }
        className="lightbox__image"
      />

      {anzahl > 1 && (
        <button
          type="button"
          onClick={() => blaettern(1)}
          aria-label="Nächstes Bild"
          className="lightbox__btn lightbox__nav lightbox__nav--next"
        >
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
