import { useAbsences } from '../../hooks/useSchedule';
import { absenceTypeLabel, formatIsoRange, toDateInput } from '../../lib/schedule';

/** Läuft der Eintrag heute schon? */
function isActive(absence) {
  const today = toDateInput();
  return absence.startDate <= today && absence.endDate >= today;
}

/**
 * Längerfristige Ausfälle im Kader – für die Wochenplanung des Trainerteams.
 *
 * Diese Einträge erzeugen KEINE Zeilen in `attendances`; sie wirken direkt auf
 * jeden Termin im Zeitraum. Deshalb ist die Liste die einzige Stelle, an der
 * sie am Stück sichtbar sind.
 *
 * @param {{ teamId: number|null }} props
 */
export default function TeamAbsences({ teamId }) {
  const { absences, loading, error } = useAbsences({ teamId });

  if (error) {
    return (
      <p role="alert" className="alert alert-error mt-3">
        {error}
      </p>
    );
  }

  if (loading) {
    return <span className="skeleton mt-3 h-16 w-full" />;
  }

  if (absences.length === 0) {
    return (
      <p className="card-note mt-3">
        Niemand aus dem Kader ist längerfristig abgemeldet.
      </p>
    );
  }

  return (
    <ul className="list-panel mt-3">
      {absences.map((absence) => (
        <li
          key={absence.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-ink">
              {absence.firstName} {absence.lastName}
            </span>
            <span className="text-sm text-ink-soft">
              {formatIsoRange(absence.startDate, absence.endDate)}
              {absence.note ? ` · ${absence.note}` : ''}
            </span>
          </span>

          <span className="flex items-center gap-2">
            {isActive(absence) && (
              <span className="badge badge-neutral">läuft gerade</span>
            )}
            <span className="badge badge-pending">
              {absenceTypeLabel(absence.type)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
