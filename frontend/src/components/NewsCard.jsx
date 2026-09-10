import { formatDateTime } from '../lib/format';

/**
 * Eine Vereins-Ankündigung im Vereinsdesign: Karte mit grünem Akzentstreifen,
 * Veröffentlichungsdatum, Titel, bis zu zwei Bildern und Fließtext.
 *
 * Bei zwei Bildern stehen sie nebeneinander (ab `sm`), darunter untereinander –
 * auf einem Handy wären zwei 16:9-Bilder nebeneinander nur noch Briefmarken.
 *
 * @param {{ item: { id:number, title:string, content:string,
 *                   imageUrl:string|null, imageUrls?:string[],
 *                   createdAt:string,
 *                   author:{firstName:string, lastName:string}|null } }} props
 */
export default function NewsCard({ item }) {
  // `imageUrls` ist die maßgebliche Form; `imageUrl` bleibt als Rückfallebene,
  // falls die Antwort noch von einer älteren Backend-Version stammt.
  const images = item.imageUrls ?? (item.imageUrl ? [item.imageUrl] : []);

  return (
    <article className="card-accent">
      <p className="eyebrow">
        {formatDateTime(item.createdAt)}
        {item.author && (
          <>
            {' · '}
            {item.author.firstName} {item.author.lastName}
          </>
        )}
      </p>

      <h3 className="section-title mt-1.5 text-base">{item.title}</h3>

      {images.length > 0 && (
        <div
          className={`mt-3 grid gap-2 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}
        >
          {images.map((url) => (
            // Kein alt-Text vorhanden: Das Bild illustriert den nebenstehenden
            // Text, daher bewusst als dekorativ ausgezeichnet (alt="").
            <img key={url} src={url} alt="" loading="lazy" className="news-image" />
          ))}
        </div>
      )}

      <p className="news-body mt-3">{item.content}</p>
    </article>
  );
}
