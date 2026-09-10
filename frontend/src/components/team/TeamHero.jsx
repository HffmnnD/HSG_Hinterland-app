/**
 * Kopfbereich der Mannschaftsseite.
 *
 * Bewusst reduziert auf die Identität der Mannschaft: Foto (falls hinterlegt),
 * Name und Liga. Kürzel, Rollen-Badge und Kennzahlen sind hier absichtlich
 * NICHT enthalten – das Kürzel steht bereits in der Kopfzeile, und Zahlen zum
 * Kader oder zur Tabelle gehören in die Reiter darunter. So bleibt der Kopf
 * ruhig und das Auge landet auf dem Namen.
 *
 * Ohne Foto trägt dieselbe Fläche einen Verlauf im Anthrazit der Marke mit
 * grünem Schimmer (siehe `.team-hero` in index.css) – die Seite sieht dann
 * gestaltet aus statt „kaputt".
 *
 * @param {{ team: { code:string, name:string, photoUrl:string|null },
 *           competition?: string|null,
 *           season?: string|null }} props
 */
export default function TeamHero({ team, competition, season }) {
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
      </div>
    </section>
  );
}
