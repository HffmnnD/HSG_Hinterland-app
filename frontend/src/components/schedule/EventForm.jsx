import { useState } from 'react';

import {
  EVENT_TYPE_LABELS,
  WEEKDAYS,
  shiftIsoDate,
  toDateInput,
} from '../../lib/schedule';

/** `YYYY-MM-DDTHH:MM:SS` -> Wert für <input type="datetime-local">. */
const toInputValue = (value) => (value ? value.slice(0, 16) : '');

// Terminarten, die von Hand angelegt werden. MATCH fehlt bewusst: Spiele
// kommen aus nuLiga, von Hand angelegte würden beim nächsten Abgleich
// doppelt im Kalender stehen.
const SINGLE_TYPES = ['SINGLE_TRAINING', 'EVENT_CAMP'];

/**
 * Formular für eine wiederkehrende Trainingszeit oder einen Einzeltermin.
 *
 * Die Mannschaft wählt der Planungsbereich – hier steht nur noch, WAS und
 * WANN. Auch die frühere Umschaltung Serie/Einzeltermin ist raus: Welcher
 * Fall gemeint ist, entscheidet der Knopf, über den das Formular geöffnet
 * wurde.
 *
 * @param {{ mode: 'series'|'single',
 *           event?: object|null,
 *           busy?: boolean,
 *           onSubmit: (payload:object, options:{scope:string}) => Promise<void>,
 *           onCancel?: () => void }} props
 *   `event` gesetzt = einen bestehenden Termin bearbeiten.
 */
export default function EventForm({
  mode,
  event = null,
  busy = false,
  onSubmit,
  onCancel,
}) {
  const editing = Boolean(event);
  const today = toDateInput();

  const [title, setTitle] = useState(
    event?.title ?? (mode === 'series' ? 'Training' : '')
  );
  const [type, setType] = useState(
    event?.type ?? (mode === 'series' ? 'REGULAR_TRAINING' : 'SINGLE_TRAINING')
  );
  const [location, setLocation] = useState(event?.location ?? '');
  const [reasonsVisible, setReasonsVisible] = useState(
    event?.reasonsVisibleToAll ?? false
  );

  // Einzeltermin
  const [startTime, setStartTime] = useState(
    toInputValue(event?.startTime) || `${today}T19:00`
  );
  const [endTime, setEndTime] = useState(
    toInputValue(event?.endTime) || `${today}T20:30`
  );

  // Serie
  const [weekdays, setWeekdays] = useState([2, 4]);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(shiftIsoDate(today, 180));
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

    if (mode === 'series' && !editing && weekdays.length === 0) {
      setFormError('Bitte mindestens einen Wochentag auswählen.');
      return;
    }

    const base = {
      title: title.trim(),
      type,
      location: location.trim() || null,
      reasonsVisibleToAll: reasonsVisible,
    };

    if (editing) {
      await onSubmit({ ...base, startTime, endTime }, { scope: 'single' });
      return;
    }

    await onSubmit(
      mode === 'series'
        ? {
            ...base,
            recurrence: {
              weekdays,
              startsOn,
              endsOn,
              startTime: clockStart,
              endTime: clockEnd,
            },
          }
        : { ...base, startTime, endTime },
      { scope: 'single' }
    );
  };

  const showSeriesFields = mode === 'series' && !editing;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <p role="alert" className="alert alert-error">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
            placeholder={mode === 'series' ? 'Training' : 'z. B. Handballcamp'}
            className="field-control"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="event-location">
            Halle / Treffpunkt
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

      {/* Bei einer Serie ist die Art immer Training – da gibt es nichts zu
          wählen. Nur beim Einzeltermin ist die Unterscheidung nötig. */}
      {mode === 'single' && !editing && (
        <div>
          <span className="field-label">Art</span>
          <div role="group" aria-label="Terminart" className="flex flex-wrap gap-1.5">
            {SINGLE_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                aria-pressed={type === value}
                disabled={busy}
                className={`chip chip-sm ${type === value ? 'chip-active' : ''}`}
              >
                {EVENT_TYPE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSeriesFields ? (
        <div className="space-y-4">
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
                Von
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
                Bis
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
              <p className="field-hint">Üblicherweise das Saisonende.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
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
      )}

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
            Abmeldegründe für alle sichtbar
          </span>
          <span className="field-hint">
            Aus: Der Kader sieht nur, wer fehlt. An: auch warum.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Speichern …' : editing ? 'Speichern' : 'Anlegen'}
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
