import { useState } from 'react';

import {
  EVENT_TYPES,
  EVENT_TYPE_HINTS,
  EVENT_TYPE_LABELS,
  WEEKDAYS,
  shiftIsoDate,
  toDateInput,
} from '../../lib/schedule';

/** Beginn/Ende eines neuen Termins: heute Abend, 19:00 bis 20:30 Uhr. */
function defaultTimes() {
  const today = toDateInput();
  return { start: `${today}T19:00`, end: `${today}T20:30` };
}

/** `YYYY-MM-DDTHH:MM:SS` -> Wert für <input type="datetime-local">. */
const toInputValue = (value) => (value ? value.slice(0, 16) : '');

/**
 * Formular für einen Termin – als Einzeltermin, mehrtägiges Event oder
 * wiederkehrende Trainingsserie.
 *
 * @param {{ teams: object[],
 *           event?: object|null,
 *           defaultTeamId?: number|null,
 *           busy?: boolean,
 *           onSubmit: (payload:object, options:{scope:string}) => Promise<void>,
 *           onCancel?: () => void }} props
 *   `event` gesetzt = Bearbeiten (die Mannschaft steht dann fest).
 */
export default function EventForm({
  teams,
  event = null,
  defaultTeamId = null,
  busy = false,
  onSubmit,
  onCancel,
}) {
  const editing = Boolean(event);
  const times = defaultTimes();

  const [teamId, setTeamId] = useState(
    String(event?.teamId ?? defaultTeamId ?? teams[0]?.id ?? '')
  );
  const [title, setTitle] = useState(event?.title ?? 'Training');
  const [type, setType] = useState(event?.type ?? 'REGULAR_TRAINING');
  const [location, setLocation] = useState(event?.location ?? '');
  const [reasonsVisible, setReasonsVisible] = useState(
    event?.reasonsVisibleToAll ?? false
  );

  // 'single' = ein Termin, 'series' = wiederkehrend.
  // Beim Bearbeiten bedeutet 'series': Änderung für alle künftigen Termine
  // der Serie.
  const [mode, setMode] = useState('single');

  const [startTime, setStartTime] = useState(
    toInputValue(event?.startTime) || times.start
  );
  const [endTime, setEndTime] = useState(
    toInputValue(event?.endTime) || times.end
  );

  const [weekdays, setWeekdays] = useState([2, 4]);
  const [startsOn, setStartsOn] = useState(toDateInput());
  const [endsOn, setEndsOn] = useState(shiftIsoDate(toDateInput(), 180));
  const [clockStart, setClockStart] = useState('19:00');
  const [clockEnd, setClockEnd] = useState('20:30');

  const [formError, setFormError] = useState(null);

  const toggleWeekday = (value) =>
    setWeekdays((current) =>
      current.includes(value)
        ? current.filter((day) => day !== value)
        : [...current, value].sort((a, b) => a - b)
    );

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    setFormError(null);

    if (!editing && !teamId) {
      setFormError('Bitte eine Mannschaft auswählen.');
      return;
    }
    if (mode === 'series' && !editing && weekdays.length === 0) {
      setFormError('Bitte mindestens einen Wochentag auswählen.');
      return;
    }

    const base = {
      title,
      type,
      location: location.trim() || null,
      reasonsVisibleToAll: reasonsVisible,
    };

    if (editing) {
      await onSubmit(
        mode === 'series' ? base : { ...base, startTime, endTime },
        { scope: mode }
      );
      return;
    }

    await onSubmit(
      mode === 'series'
        ? {
            ...base,
            teamId: Number(teamId),
            recurrence: {
              weekdays,
              startsOn,
              endsOn,
              startTime: clockStart,
              endTime: clockEnd,
            },
          }
        : { ...base, teamId: Number(teamId), startTime, endTime },
      { scope: 'single' }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <p role="alert" className="alert alert-error">
          {formError}
        </p>
      )}

      {/* ------------------------------------------------ Was für ein Termin */}
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <div>
            <label className="field-label" htmlFor="event-team">
              Mannschaft
            </label>
            <select
              id="event-team"
              value={teamId}
              onChange={(changed) => setTeamId(changed.target.value)}
              disabled={busy}
              className="field-control"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="event-type">
            Art
          </label>
          <select
            id="event-type"
            value={type}
            onChange={(changed) => setType(changed.target.value)}
            disabled={busy}
            className="field-control"
          >
            {EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="field-hint">{EVENT_TYPE_HINTS[type]}</p>
        </div>

        <div>
          <label className="field-label" htmlFor="event-title">
            Titel
          </label>
          <input
            id="event-title"
            type="text"
            value={title}
            onChange={(changed) => setTitle(changed.target.value)}
            maxLength={120}
            required
            disabled={busy}
            placeholder="z. B. Training oder Handballcamp"
            className="field-control"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="event-location">
            Ort <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={(changed) => setLocation(changed.target.value)}
            maxLength={120}
            disabled={busy}
            placeholder="z. B. Halle West"
            className="field-control"
          />
        </div>
      </div>

      {/* ------------------------------------------------------- Zeitpunkt */}
      <fieldset className="fieldset">
        <legend>{editing ? 'Umfang der Änderung' : 'Wann?'}</legend>

        <div
          role="group"
          aria-label={editing ? 'Umfang' : 'Terminart'}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            onClick={() => setMode('single')}
            aria-pressed={mode === 'single'}
            disabled={busy}
            className={`chip chip-sm ${mode === 'single' ? 'chip-active' : ''}`}
          >
            {editing ? 'Nur dieser Termin' : 'Einzeltermin'}
          </button>
          <button
            type="button"
            onClick={() => setMode('series')}
            aria-pressed={mode === 'series'}
            disabled={busy || (editing && !event?.seriesId)}
            title={
              editing && !event?.seriesId
                ? 'Dieser Termin gehört zu keiner Serie.'
                : undefined
            }
            className={`chip chip-sm ${mode === 'series' ? 'chip-active' : ''}`}
          >
            {editing ? 'Ganze Serie' : 'Wiederkehrend'}
          </button>
        </div>

        {mode === 'single' ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="event-start">
                Beginn
              </label>
              <input
                id="event-start"
                type="datetime-local"
                value={startTime}
                onChange={(changed) => setStartTime(changed.target.value)}
                required
                disabled={busy}
                className="field-control"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="event-end">
                Ende
              </label>
              <input
                id="event-end"
                type="datetime-local"
                value={endTime}
                onChange={(changed) => setEndTime(changed.target.value)}
                required
                disabled={busy}
                className="field-control"
              />
              <p className="field-hint">
                Für ein mehrtägiges Camp hier den letzten Tag eintragen.
              </p>
            </div>
          </div>
        ) : editing ? (
          <p className="field-hint mt-4">
            Titel, Art, Ort und die Sichtbarkeit der Gründe werden für alle
            noch nicht begonnenen Termine der Serie übernommen. Datum und
            Uhrzeit der einzelnen Einheiten bleiben unverändert – dafür die
            Serie neu anlegen.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <span className="field-label">Wochentage</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    role="checkbox"
                    aria-checked={weekdays.includes(day.value)}
                    aria-label={day.label}
                    disabled={busy}
                    onClick={() => toggleWeekday(day.value)}
                    className={`chip chip-sm ${
                      weekdays.includes(day.value) ? 'chip-active' : ''
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="series-clock-start">
                  Beginn
                </label>
                <input
                  id="series-clock-start"
                  type="time"
                  value={clockStart}
                  onChange={(changed) => setClockStart(changed.target.value)}
                  required
                  disabled={busy}
                  className="field-control"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="series-clock-end">
                  Ende
                </label>
                <input
                  id="series-clock-end"
                  type="time"
                  value={clockEnd}
                  onChange={(changed) => setClockEnd(changed.target.value)}
                  required
                  disabled={busy}
                  className="field-control"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="series-from">
                  Erster Termin
                </label>
                <input
                  id="series-from"
                  type="date"
                  value={startsOn}
                  onChange={(changed) => setStartsOn(changed.target.value)}
                  required
                  disabled={busy}
                  className="field-control"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="series-to">
                  Letzter Termin
                </label>
                <input
                  id="series-to"
                  type="date"
                  value={endsOn}
                  onChange={(changed) => setEndsOn(changed.target.value)}
                  required
                  disabled={busy}
                  className="field-control"
                />
                <p className="field-hint">
                  Üblicherweise das Saisonende. Alle Einheiten werden sofort
                  angelegt und sind für den Kader sichtbar.
                </p>
              </div>
            </div>
          </div>
        )}
      </fieldset>

      {/* --------------------------------------------------- Sichtbarkeit */}
      <div className="rounded-md border border-line bg-surface/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={reasonsVisible}
            onChange={(changed) => setReasonsVisible(changed.target.checked)}
            disabled={busy}
            className="mt-0.5 h-5 w-5 shrink-0 accent-hsg-green"
          />
          <span>
            <span className="block text-sm font-bold text-ink">
              Abmeldegründe für alle Spieler:innen sichtbar
            </span>
            <span className="field-hint">
              Aus (Standard): Der Kader sieht nur, WER fehlt. Den Grund sieht
              nur das Trainerteam. An: Jede:r sieht auch, WARUM jemand fehlt.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy
            ? 'Speichern …'
            : editing
              ? 'Änderungen speichern'
              : mode === 'series'
                ? 'Serie anlegen'
                : 'Termin anlegen'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn btn-ghost"
          >
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
