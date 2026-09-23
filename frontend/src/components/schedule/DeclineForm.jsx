import { useState } from 'react';

import { QUICK_REASONS } from '../../lib/schedule';

/**
 * Abmelde-Formular. Der Grund ist PFLICHT – das ist die Kernregel des Moduls
 * und wird zusätzlich im Backend geprüft.
 *
 * Die Vorschlags-Chips füllen das Feld nur aus; abgeschickt wird immer der
 * Text im Eingabefeld, damit auch ein eigener Grund möglich bleibt.
 *
 * @param {{ onSubmit: (reason:string) => void, onCancel: () => void,
 *           busy?: boolean, label?: string, initialReason?: string }} props
 */
export default function DeclineForm({
  onSubmit,
  onCancel,
  busy = false,
  label = 'Warum bist du nicht dabei?',
  initialReason = '',
}) {
  const [reason, setReason] = useState(initialReason);
  const trimmed = reason.trim();

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-line bg-surface p-3">
      <label className="field-label" htmlFor="decline-reason">
        {label}
      </label>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={busy}
            onClick={() => setReason(suggestion)}
            aria-pressed={trimmed === suggestion}
            className={`chip chip-sm ${trimmed === suggestion ? 'chip-active' : ''}`}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <input
        id="decline-reason"
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={200}
        required
        autoFocus
        placeholder="z. B. Krank, Beruflich, Auswärtstermin …"
        className="field-control"
      />
      <p className="field-hint">
        Ohne Grund ist keine Abmeldung möglich. Wer den Grund sieht, legt
        der/die Trainer:in je Termin fest.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !trimmed}
          className="btn btn-primary btn-sm"
        >
          {busy ? 'Speichern …' : 'Abmeldung speichern'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost btn-sm"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
