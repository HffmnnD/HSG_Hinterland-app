import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { formatDateTime } from '../lib/format';
import Lightbox from './Lightbox';

// So viele Vorschaubilder zeigt die Karte höchstens; der Rest steckt hinter
// einer „+N"-Kachel und ist über den Vollbild-Betrachter erreichbar. Ohne
// Deckel würde ein Beitrag mit 40 Bildern den ganzen Feed auseinanderziehen.
const MAX_VORSCHAUEN = 6;

/**
 * Eine Vereins-Ankündigung im Vereinsdesign: Karte mit grünem Akzentstreifen,
 * Veröffentlichungsdatum, Titel, Bilderstrecke und Fließtext.
 *
 * Zwei Dinge halten lange Beiträge im Zaum:
 *   - Der Text wird nach `--news-clamp` Zeilen abgeschnitten und lässt sich
 *     aufklappen. Der Knopf erscheint NUR, wenn tatsächlich etwas abgeschnitten
 *     ist (gemessen, nicht geraten – siehe unten).
 *   - Von vielen Bildern zeigt die Karte die ersten sechs.
 *
 * @param {{ item: { id:number, title:string, content:string,
 *                   imageUrl:string|null, imageUrls?:string[],
 *                   createdAt:string,
 *                   author:{firstName:string, lastName:string}|null },
 *           highlight?: boolean }} props
 *   `highlight` macht den Beitrag zum Aufmacher der Startseite: größere
 *   Überschrift und mehr sichtbare Zeilen, bevor der Text abgeschnitten wird.
 *   Sonst ist es dieselbe Karte – ein zweites Bauteil für „derselbe Beitrag,
 *   nur größer" wäre doppelte Arbeit bei jeder künftigen Änderung.
 */
export default function NewsCard({ item, highlight = false }) {
  // `imageUrls` ist die maßgebliche Form; `imageUrl` bleibt als Rückfallebene,
  // falls die Antwort noch von einer älteren Backend-Version stammt.
  const images = item.imageUrls ?? (item.imageUrl ? [item.imageUrl] : []);

  const [ausgeklappt, setAusgeklappt] = useState(false);
  const [abgeschnitten, setAbgeschnitten] = useState(false);
  const [vollbildIndex, setVollbildIndex] = useState(null);
  const textRef = useRef(null);

  /**
   * Feststellen, ob der Text überhaupt abgeschnitten ist.
   *
   * Gemessen statt über die Zeichenzahl geschätzt: ob sechs Zeilen voll werden,
   * hängt von Fensterbreite, Schriftgröße und Zeilenumbrüchen ab. Eine
   * Zeichen-Schwelle träfe mal zu früh, mal zu spät – und ein Knopf, der beim
   * Klick nichts sichtbar ändert, ist schlimmer als keiner.
   *
   * Gemessen wird an drei Punkten, weil jeder allein Lücken hat:
   *
   *   1. Direkt nach dem Einhängen. Nicht synchron im Effektkörper – dort
   *      verlangt die Lint-Regel `set-state-in-effect` zu Recht Zurückhaltung;
   *      ein `setTimeout(…, 0)` genügt, denn das Auslesen von `scrollHeight`
   *      erzwingt das Layout selbst.
   *   2. Bei Größenänderung des Fensters: andere Breite, andere Umbrüche.
   *   3. Wenn die Webfonts geladen sind. Oswald und Lato kommen später als das
   *      erste Layout und ändern die Zeilenlänge – ohne diesen Punkt bliebe
   *      eine Messung mit der Ersatzschrift stehen.
   *
   * Zwei Wege, die naheliegen und hier NICHT tragen:
   *
   *   - `ResizeObserver` auf dem Absatz. Durch die Klammerung hat der Absatz
   *     eine FESTE Höhe, seine Box ändert sich also nie; die zugesicherte
   *     Erstmeldung beim Beobachten kam in der Praxis nicht an.
   *   - `requestAnimationFrame`. Feuert in einer nicht gezeichneten Seite
   *     überhaupt nicht – also in jedem Hintergrund-Tab. Der Knopf fehlte
   *     dort bei jedem langen Beitrag.
   *
   * Im ausgeklappten Zustand wird NICHT gemessen: dort gibt es keine
   * Begrenzung mehr, die Messung meldete „passt" und der Knopf zum Zuklappen
   * verschwände.
   */
  useEffect(() => {
    const element = textRef.current;
    if (!element || ausgeklappt) return undefined;

    let abgebrochen = false;
    let timer = 0;

    const messen = () => {
      // 4 px Toleranz gegen Rundungsfehler bei gebrochenen Zeilenhöhen.
      if (!abgebrochen) {
        setAbgeschnitten(element.scrollHeight - element.clientHeight > 4);
      }
    };
    const planen = (verzoegerung) => {
      clearTimeout(timer);
      timer = setTimeout(messen, verzoegerung);
    };

    planen(0);
    // Beim Ziehen am Fensterrand kommen Dutzende Ereignisse pro Sekunde; jede
    // Messung erzwingt ein Layout. Der kurze Verzug bündelt sie.
    const beiResize = () => planen(150);
    window.addEventListener('resize', beiResize);
    document.fonts?.ready.then(() => planen(0)).catch(() => {});

    return () => {
      abgebrochen = true;
      clearTimeout(timer);
      window.removeEventListener('resize', beiResize);
    };
  }, [ausgeklappt, item.content]);

  const sichtbare = images.slice(0, MAX_VORSCHAUEN);
  const weitere = images.length - sichtbare.length;

  return (
    <article className="card-accent">
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

      <h3
        className={`section-title mt-1.5 ${
          highlight ? 'text-lg sm:text-xl' : 'text-base'
        }`}
      >
        {item.title}
      </h3>

      {images.length > 0 && (
        <ul className={`news-gallery news-gallery--${images.length > 1 ? 'grid' : 'single'} mt-3`}>
          {sichtbare.map((url, index) => {
            const istLetzteMitRest = weitere > 0 && index === sichtbare.length - 1;
            return (
              <li key={url}>
                <button
                  type="button"
                  onClick={() => setVollbildIndex(index)}
                  className="news-gallery__item"
                  aria-label={
                    istLetzteMitRest
                      ? `Alle ${images.length} Bilder in voller Größe ansehen`
                      : `Bild ${index + 1} von ${images.length} in voller Größe ansehen`
                  }
                >
                  {/* Kein alt-Text: Das Bild illustriert den nebenstehenden
                      Text und ist bewusst dekorativ (die Beschriftung des
                      Knopfes sagt, was der Klick tut). */}
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

      <p
        ref={textRef}
        className={`news-body mt-3 ${
          ausgeklappt
            ? ''
            : `news-body--collapsed ${highlight ? 'news-body--spotlight' : ''}`
        }`}
      >
        {item.content}
      </p>

      {(abgeschnitten || ausgeklappt) && (
        <button
          type="button"
          onClick={() => setAusgeklappt((offen) => !offen)}
          aria-expanded={ausgeklappt}
          className="btn btn-ghost btn-sm -ml-3 mt-1"
        >
          {ausgeklappt ? (
            <>
              <ChevronUp size={14} aria-hidden="true" />
              Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" />
              Mehr anzeigen
            </>
          )}
        </button>
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
