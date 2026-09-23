import { useState } from 'react';

import { apiFetch } from '../../lib/api';
import { useAbsences } from '../../hooks/useSchedule';
import {
  ABSENCE_TYPES,
  absenceTypeLabel,
  formatIsoRange,
  shiftIsoDate,
  toDateInput,
} from '../../lib/schedule';

/** Kurzbeschreibung je Art – erklärt, wofür der Eintrag gedacht ist. */
const TYPE_HINTS = {
  VACATION: 'Du bist verreist und in diesem Zeitraum bei keinem Termin dabei.',
  INJURY: 'Du fällst verletzungsbedingt aus – bis auf Weiteres oder bis zu einem Datum.',
  OTHER: 'Ein anderer Grund, der über mehrere Termine hinweg gilt.',
};

/** Läuft der Eintrag gerade? */
function isActive(absence) {
  const today = toDateInput();
  return absence.startDate <= today && absence.endDate >= today;
}

/**
 * Eigenbereich für Urlaub und Verletzungen.
 *
 * Ein Eintrag hier markiert JEDEN Termin im Zeitraum automatisch als
 * Absage – man muss sich nicht von jedem Training einzeln abmelden.
 *
 * @param {{ teams: object[], busy?: boolean,
 *           onRun: (action:() => Promise<any>, fallback?:string) => Promise<any>,
 *           onChanged: () => Promise<void>|void }} props
 *   `teams` sind die Mannschaften, in denen die Person spielt. `onChanged`
 *   lädt die Terminliste neu – ein Eintrag hier ändert dort jeden Status im
 *   Zeitraum.
 */
export default function AbsencePanel({
  teams,
  busy = false,
  onRun,
  onChanged,
}) {
  const { absences, loading, error, reload } = useAbsences();

  const [type, setType] = useState('VACATION');
  const [startDate, setStartDate] = useState(toDateInput());
  const [endDate, setEndDate] = useState(shiftIsoDate(toDateInput(), 13));
  const [note, setNote] = useState('');
  // '' = gilt für alle Mannschaften (Normalfall bei Urlaub und Verletzung).
  const [teamId, setTeamId] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    const created = await onRun(
      () =>
        apiFetch('/api/absences/long-term', {
          method: 'POST',
          body: JSON.stringify({
            type,
            startDate,
            endDate,
            note: note.trim() || null,
            teamId: teamId === '' ? null : Number(teamId),
          }),
        }),
      'Abwesenheit gespeichert.'
    );
    if (created) {
      setNote('');
      await reload();
      await onChanged();
    }
  };

  const handleDelete = async (absence) => {
    const removed = await onRun(
      () =>
        apiFetch(`/api/absences/long-term/${absence.id}`, { method: 'DELETE' }),
      'Abwesenheit entfernt.'
    );
    if (removed) {
      await reload();
      await onChanged();
    }
  };

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------- Formular */}
      <section className="card-accent">
        <p className="eyebrow">Neuer Eintrag</p>
        <h2 className="section-title mt-1.5 text-base">
          Urlaub oder Verletzung eintragen
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Alle Termine im gewählten Zeitraum werden automatisch als „nicht da"
          geführt – mit dem hier angegebenen Grund. Du musst dich nicht von
          jedem Training einzeln abmelden.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <span className="field-label">Art</span>
            <div role="group" aria-label="Art der Abwesenheit" className="flex flex-wrap gap-1.5">
              {ABSENCE_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  aria-pressed={type === value}
                  disabled={busy}
                  className={`chip chip-sm ${type === value ? 'chip-active' : ''}`}
                >
                  {absenceTypeLabel(value)}
                </button>
              ))}
            </div>
            <p className="field-hint">{TYPE_HINTS[type]}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="absence-from">
                Von
              </label>
              <input
                id="absence-from"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
                disabled={busy}
                className="field-control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="absence-to">
                Bis (einschließlich)
              </label>
              <input
                id="absence-to"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
                disabled={busy}
                className="field-control"
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="absence-note">
              Notiz{' '}
              <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="absence-note"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder="z. B. Bänderriss oder Familienurlaub"
              className="field-control"
            />
            <p className="field-hint">
              Steht als Grund an den betroffenen Terminen. Ohne Notiz erscheint
              nur „{absenceTypeLabel(type)}".
            </p>
          </div>

          {teams.length > 1 && (
            <div>
              <label className="field-label" htmlFor="absence-team">
                Gilt für
              </label>
              <select
                id="absence-team"
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                disabled={busy}
                className="field-control"
              >
                <option value="">Alle meine Mannschaften</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    Nur {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? 'Speichern …' : 'Abwesenheit eintragen'}
          </button>
        </form>
      </section>

      {/* ----------------------------------------------------------- Liste */}
      <section>
        <h2 className="section-title">Meine Abwesenheiten</h2>

        {error && (
          <p role="alert" className="alert alert-error mt-3">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-3 space-y-2">
            <span className="skeleton h-16 w-full" />
            <span className="skeleton h-16 w-full" />
          </div>
        ) : absences.length === 0 ? (
          <p className="card-note mt-3">
            Kein Eintrag. Solange hier nichts steht, giltst du bei jedem Termin
            als dabei.
          </p>
        ) : (
          <ul className="list-panel mt-3">
            {absences.map((absence) => (
              <li
                key={absence.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-pending">
                      {absenceTypeLabel(absence.type)}
                    </span>
                    <span className="font-semibold text-ink">
                      {formatIsoRange(absence.startDate, absence.endDate)}
                    </span>
                    {isActive(absence) && (
                      <span className="badge badge-neutral">läuft gerade</span>
                    )}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {absence.note ?? 'Ohne Notiz'}
                    {absence.teamId
                      ? ` · nur ${
                          teams.find((team) => team.id === absence.teamId)?.name ??
                          'eine Mannschaft'
                        }`
                      : ' · alle Mannschaften'}
                  </span>
                </span>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(absence)}
                  className="btn btn-danger btn-sm"
                >
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="field-hint">
          Wird ein Eintrag entfernt, giltst du an den betroffenen Terminen
          wieder als dabei – sofern du dich dort nicht einzeln abgemeldet hast.
        </p>
      </section>
    </div>
  );
}
