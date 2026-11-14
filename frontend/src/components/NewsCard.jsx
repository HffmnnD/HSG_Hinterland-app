import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { formatDateTime } from '../lib/format';
import { excerpt } from '../lib/content';
import Lightbox from './Lightbox';
import { NewsExtrasView } from './news/NewsExtras';

// So viele Vorschaubilder zeigt die aufgeklappte Karte höchstens; der Rest
// steckt hinter einer „+N"-Kachel und ist über den Vollbild-Betrachter erreichbar.
const MAX_VORSCHAUEN = 6;

/**
 * Eine Vereins-Ankündigung: Titelbild, Datum, Titel, Untertitel und der
 * Anfang des Textes. Lange Beiträge klappen mit „Mehr lesen" auf – dann
 * erscheinen der ganze Text, alle Bilder und Anhänge, und am Ende
 * „Weniger lesen" zum Zuklappen.
 *
 * @param {{ item: { id:number, title:string, subtitle?:string|null, content:string,
 *                   imageUrl:string|null, imageUrls?:string[], createdAt:string,
 *                   author:{firstName:string, lastName:string}|null },
 *           highlight?: boolean }} props
 *   `highlight` macht den Beitrag zum Aufmacher: größere Überschrift, etwas
 *   längere Vorschau.
 */
export default function NewsCard({ item, highlight = false }) {
  const images = item.imageUrls ?? (item.imageUrl ? [item.imageUrl] : []);
  const [open, setOpen] = useState(false);
  const [vollbildIndex, setVollbildIndex] = useState(null);

  const { short, cut } = excerpt(item.content, highlight ? 360 : 220);
  // Aufklappen lohnt auch, wenn der Text kurz ist, aber mehrere Bilder,
  // Anhänge oder ein Link dranhängen.
  const hasMore = cut || images.length > 1 || (item.files?.length ?? 0) > 0 || Boolean(item.link);
  const sichtbare = images.slice(0, MAX_VORSCHAUEN);
  const weitere = images.length - sichtbare.length;

  return (
    <article className="card-accent min-w-0">
      {images.length > 0 && !open && (
        <button
          type="button"
          onClick={() => setVollbildIndex(0)}
          className="news-cover mb-3"
          aria-label={`Titelbild von „${item.title}" in voller Größe ansehen`}
        >
          <img src={images[0]} alt="" loading="lazy" />
          {images.length > 1 && <span className="news-cover__count">{images.length} Bilder</span>}
        </button>
      )}

      <p className="eyebrow flex flex-wrap items-center gap-x-1.5">
        {highlight && <span className="badge badge-trainer">Neu</span>}
        {formatDateTime(item.createdAt)}
        {item.author && (
          <>
            {' · '}
            {item.author.firstName} {item.author.lastName}
          </>
        )}
      </p>

      <h3 className={`section-title mt-1.5 ${highlight ? 'text-lg sm:text-xl' : 'text-base'}`}>{item.title}</h3>
      {item.subtitle && <p className="mt-1 font-semibold text-ink-soft">{item.subtitle}</p>}

      <p className="news-body mt-3">{open ? item.content : short}</p>

      {!open && hasMore && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="btn btn-ghost btn-sm -ml-3 mt-1"
        >
          <ChevronDown size={14} aria-hidden="true" />
          Mehr lesen
        </button>
      )}

      {open && (
        <>
          {images.length > 0 && (
            <ul className={`news-gallery news-gallery--${images.length > 1 ? 'grid' : 'single'} mt-4`}>
              {sichtbare.map((url, index) => {
                const istLetzteMitRest = weitere > 0 && index === sichtbare.length - 1;
                return (
                  <li key={url}>
                    <button
                      type="button"
                      onClick={() => setVollbildIndex(index)}
                      className="news-gallery__item"
                      aria-label={`Bild ${index + 1} von ${images.length} in voller Größe ansehen`}
                    >
                      <img src={url} alt="" loading="lazy" />
                      {istLetzteMitRest && (
                        <span className="news-gallery__more" aria-hidden="true">
                          +{weitere}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <NewsExtrasView item={item} />

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-expanded
            className="btn btn-ghost btn-sm -ml-3 mt-2"
          >
            <ChevronUp size={14} aria-hidden="true" />
            Weniger lesen
          </button>
        </>
      )}

      {vollbildIndex !== null && (
        <Lightbox
          images={images}
          startIndex={vollbildIndex}
          title={item.title}
          onClose={() => setVollbildIndex(null)}
        />
      )}
    </article>
  );
}
