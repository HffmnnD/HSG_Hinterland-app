/**
 * Kopfbereich der Mannschaftsseite.
 *
 * Bewusst reduziert auf die Identität der Mannschaft: Foto (falls hinterlegt),
 * Name, Liga und die Haupt-Sponsoren. Kürzel, Rollen-Badge und Kennzahlen sind
 * hier absichtlich NICHT mehr enthalten – das Kürzel steht bereits in der
 * Kopfzeile, und Zahlen zum Kader oder zur Tabelle gehören in die Reiter
 * darunter. So bleibt der Kopf ruhig und das Auge landet auf dem Namen.
 *
 * Ohne Foto trägt dieselbe Fläche einen Verlauf im Anthrazit der Marke mit
 * grünem Schimmer (siehe `.team-hero` in index.css) – die Seite sieht dann
 * gestaltet aus statt „kaputt".
 *
 * @param {{ team: { code:string, name:string, photoUrl:string|null },
 *           competition?: string|null,
 *           season?: string|null,
 *           sponsors?: {id:number, name:string, websiteUrl:string|null}[] }} props
 */
export default function TeamHero({
  team,
  competition,
  season,
  sponsors = [],
}) {
  const hasPhoto = Boolean(team.photoUrl);

  return (
    <section className="team-hero">
      {hasPhoto && (
        <>
          {/* Dekoratives Mannschaftsfoto – die Information steht daneben. */}
          <img src={team.photoUrl} alt="" className="team-hero__image" />
          <div className="team-hero__scrim" aria-hidden="true" />
        </>
      )}

      <div className={`team-hero__body ${hasPhoto ? '' : 'sm:pt-10'}`}>
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-[0.02em] text-white sm:text-3xl">
          {team.name}
        </h1>

        {(competition || season) && (
          <p className="mt-1.5 text-sm text-white/80">
            {[competition, season].filter(Boolean).join(' · ')}
          </p>
        )}

        {sponsors.length > 0 && (
          <div className="mt-5 border-t border-white/15 pt-3">
            <p className="quick-stat__label">Präsentiert von</p>
            <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {sponsors.map((sponsor) => (
                <li
                  key={sponsor.id}
                  className="font-display text-sm font-semibold uppercase tracking-[0.04em] text-white/90"
                >
                  {sponsor.websiteUrl ? (
                    // Externe Ziele: noopener/noreferrer, damit die Zielseite
                    // weder auf unser Fenster zugreifen noch den Referrer lesen kann.
                    <a
                      href={sponsor.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {sponsor.name}
                    </a>
                  ) : (
                    sponsor.name
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
