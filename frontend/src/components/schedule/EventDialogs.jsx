import { useState } from 'react';

import Modal from '../ui/Modal';
import EventForm from './EventForm';

/**
 * Termin absagen – mit Pflichtgrund.
 *
 * Absagen ist nicht dasselbe wie Löschen: Der Termin bleibt im Kalender
 * stehen und ist für alle deutlich als abgesagt gekennzeichnet. Wer nicht in
 * die App schaut, stünde sonst vor der Halle.
 *
 * @param {{ event: object, busy?: boolean,
 *           onConfirm: (cancelled:boolean, reason:string|null) => void,
 *           onClose: () => void }} props
 */
export function CancelDialog({ event, busy = false, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const cancelled = Boolean(event.cancelledAt);
  const trimmed = reason.trim();

  if (cancelled) {
    return (
      <Modal title="Absage zurücknehmen?" onClose={onClose}>
        <p className="mt-2 text-sm text-ink-soft">
          „{event.title}" findet dann wieder statt und zählt erneut in die
          Beteiligung. Die bisherigen Rückmeldungen bleiben erhalten.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(false, null)}
            className="btn btn-primary btn-sm"
          >
            Findet wieder statt
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            Abbrechen
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Termin absagen" onClose={onClose}>
      <p className="mt-2 text-sm text-ink-soft">
        „{event.title}" bleibt im Kalender stehen und wird für alle groß als
        abgesagt gekennzeichnet. In die Beteiligung zählt er nicht mehr.
      </p>

      <form
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (trimmed) onConfirm(true, trimmed);
        }}
        className="mt-4"
      >
        <label className="field-label" htmlFor="cancel-reason">
          Grund
        </label>
        <input
          id="cancel-reason"
          type="text"
          value={reason}
          onChange={(changed) => setReason(changed.target.value)}
          maxLength={200}
          required
          placeholder="z. B. Halle belegt"
          className="field-control"
        />
        <p className="field-hint">Sehen alle in der Mannschaft.</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !trimmed}
            className="btn btn-primary btn-sm"
          >
            {busy ? 'Speichern …' : 'Absagen'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Termin endgültig löschen.
 *
 * Für versehentlich angelegte Termine. Wenn ein Training nur ausfällt, ist
 * „Absagen" das Richtige – dabei bleibt die Information erhalten.
 *
 * @param {{ event: object, busy?: boolean,
 *           onConfirm: (scope:'single'|'series') => void,
 *           onClose: () => void }} props
 */
export function DeleteDialog({ event, busy = false, onConfirm, onClose }) {
  return (
    <Modal title="Termin löschen?" onClose={onClose}>
      <p className="mt-2 text-sm text-ink-soft">
        „{event.title}" verschwindet mitsamt allen Rückmeldungen aus dem
        Kalender und aus jeder Statistik. Das lässt sich nicht rückgängig
        machen.
      </p>
      <p className="field-hint">
        Fällt der Termin nur aus? Dann ist „Absagen" besser – so bleibt er
        sichtbar.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm('single')}
          className="btn btn-danger btn-sm"
        >
          Nur diesen Termin
        </button>
        {event.seriesId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm('series')}
            className="btn btn-danger btn-sm"
          >
            Ganze Trainingszeit
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="btn btn-ghost btn-sm"
        >
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}

/**
 * Termin bearbeiten.
 *
 * @param {{ event: object, busy?: boolean,
 *           onSubmit: (payload:object, options:{scope:string}) => void,
 *           onClose: () => void }} props
 */
export function EditDialog({ event, busy = false, onSubmit, onClose }) {
  return (
    <Modal title="Termin bearbeiten" onClose={onClose}>
      <div className="mt-4">
        <EventForm
          mode="single"
          event={event}
          busy={busy}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}
