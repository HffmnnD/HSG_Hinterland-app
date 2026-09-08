import { formatDateTime } from '../lib/format';

/**
 * Eine Vereins-Ankündigung im Vereinsdesign: Karte mit grünem Akzentstreifen,
 * Veröffentlichungsdatum, Titel, optionalem Bild und Fließtext.
 *
 * @param {{ item: { id:number, title:string, content:string,
 *                   imageUrl:string|null, createdAt:string,
 *                   author:{firstName:string, lastName:string}|null } }} props
 */
export default function NewsCard({ item }) {
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

      {item.imageUrl && (
        // Kein alt-Text vorhanden: Das Bild illustriert den nebenstehenden
        // Text, daher bewusst als dekorativ ausgezeichnet (alt="").
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="news-image mt-3"
        />
      )}

      <p className="news-body mt-3">{item.content}</p>
    </article>
  );
}
