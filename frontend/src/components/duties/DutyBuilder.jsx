import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { buildSeries, toLocalInput } from '../../lib/duties';
import { toDateInput } from '../../lib/schedule';

/**
 * Dienste zusammenstellen: per Vorlage (mehrere hintereinander am selben Tag)
 * oder einzeln. Alles landet erst in einer Vorschau, in der sich Titel, Zeiten
 * und Plätze noch anpassen lassen.
 *
 * @param {{ categories: {key:string,label:string}[], maxCapacity?: number,
 *           drafts: object[], onChange: (drafts:object[]) => void,
 *           disabled?: boolean }} props
 */
export default function DutyBuilder({ categories, maxCapacity = 50, drafts, onChange, disabled = false }) {
  const [mode, setMode] = useState('series');
  const [error, setError] = useState(null);

  const [template, setTemplate] = useState(() => ({
    title: '',
    date: toDateInput(new Date(Date.now() + 7 * 86400000)),
    start: '10:00',
    duration: 90,
    count: 4,
    gap: 0,
    capacity: 1,
    category: categories[0]?.key ?? 'helfer',
    naming: 'time',
  }));
  const [single, setSingle] = useState({ title: '', startTime: '', endTime: '', capacity: 1 });

  const preview = mode === 'series' ? buildSeries(template) : null;
  const setT = (patch) => setTemplate((prev) => ({ ...prev, ...patch }));
  const number = (value) => (value === '' ? '' : Number(value));

  const addSeries = () => {
    const { duties, error: problem } = buildSeries(template);
    if (problem) return setError(problem);
    setError(null);
    onChange([...drafts, ...duties]);
    // Die nächste Reihe schließt direkt an die letzte an.
    const end = duties[duties.length - 1].endTime;
    setT({ date: end.slice(0, 10), start: end.slice(11, 16) });
  };

  const addSingle = () => {
    if (!single.title.trim()) return setError('Titel fehlt.');
    if (!single.startTime || !single.endTime) return setError('Beginn und Ende fehlen.');
    if (single.endTime <= single.startTime) return setError('Das Ende muss nach dem Beginn liegen.');
    setError(null);
    onChange([
      ...drafts,
      {
        key: `s-${Date.now()}`,
        title: single.title.trim(),
        startTime: single.startTime,
        endTime: single.endTime,
        capacity: single.capacity || 1,
        category: template.category,
      },
    ]);
    setSingle({ title: '', startTime: single.endTime, endTime: '', capacity: single.capacity });
  };

  const updateDraft = (index, patch) =>
    onChange(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  const removeDraft = (index) => onChange(drafts.filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="switcher" role="group" aria-label="Art">
        {[
          { key: 'series', label: 'Vorlage' },
          { key: 'single', label: 'Einzeln' },
        ].map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={mode === entry.key}
            onClick={() => setMode(entry.key)}
            className={`switcher__btn ${mode === entry.key ? 'switcher__btn--active' : ''}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      {mode === 'series' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2">
            <span className="field-label">Titel</span>
            <input
              className="field-control"
              value={template.title}
              maxLength={100}
              placeholder="Kuchenverkauf"
              onChange={(e) => setT({ title: e.target.value })}
              disabled={disabled}
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="field-label">Tag</span>
            <input
              type="date"
              className="field-control"
              value={template.date}
              onChange={(e) => setT({ date: e.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            <span className="field-label">Beginn</span>
            <input
              type="time"
              className="field-control"
              value={template.start}
              onChange={(e) => setT({ start: e.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            <span className="field-label">Dauer (Min.)</span>
            <input
              type="number"
              min={5}
              max={1440}
              step={5}
              className="field-control"
              value={template.duration}
              onChange={(e) => setT({ duration: number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label>
            <span className="field-label">Anzahl</span>
            <input
              type="number"
              min={1}
              max={100}
              className="field-control"
              value={template.count}
              onChange={(e) => setT({ count: number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label>
            <span className="field-label">Pause (Min.)</span>
            <input
              type="number"
              min={0}
              max={600}
              step={5}
              className="field-control"
              value={template.gap}
              onChange={(e) => setT({ gap: number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label>
            <span className="field-label">Personen je Dienst</span>
            <input
              type="number"
              min={1}
              max={maxCapacity}
              className="field-control"
              value={template.capacity}
              onChange={(e) => setT({ capacity: number(e.target.value) })}
              disabled={disabled}
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="field-label">Titel der Dienste</span>
            <select
              className="field-control"
              value={template.naming}
              onChange={(e) => setT({ naming: e.target.value })}
              disabled={disabled}
            >
              <option value="time">mit Uhrzeit</option>
              <option value="number">nummeriert</option>
            </select>
          </label>
          {categories.length > 1 && (
            <label className="col-span-2 sm:col-span-1">
              <span className="field-label">Art</span>
              <select
                className="field-control"
                value={template.category}
                onChange={(e) => setT({ category: e.target.value })}
                disabled={disabled}
              >
                {categories.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-4">
            <button
              type="button"
              onClick={addSeries}
              disabled={disabled || Boolean(preview?.error)}
              className="btn btn-outline btn-sm"
            >
              <Plus size={16} aria-hidden="true" />
              {preview?.error ? 'Dienste erzeugen' : `${preview.duties.length} Dienste erzeugen`}
            </button>
            {!preview?.error && preview.duties.length > 0 && (
              <span className="text-xs text-ink-muted">
                {preview.duties[0].title} … {preview.duties[preview.duties.length - 1].title}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2">
            <span className="field-label">Titel</span>
            <input
              className="field-control"
              value={single.title}
              maxLength={120}
              placeholder="Aufbau"
              onChange={(e) => setSingle((prev) => ({ ...prev, title: e.target.value }))}
              disabled={disabled}
            />
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className="field-label">Personen</span>
            <input
              type="number"
              min={1}
              max={maxCapacity}
              className="field-control"
              value={single.capacity}
              onChange={(e) => setSingle((prev) => ({ ...prev, capacity: number(e.target.value) }))}
              disabled={disabled}
            />
          </label>
          <span className="hidden sm:block" />
          <label className="col-span-2">
            <span className="field-label">Beginn</span>
            <input
              type="datetime-local"
              className="field-control"
              value={single.startTime}
              onChange={(e) => setSingle((prev) => ({ ...prev, startTime: e.target.value }))}
              disabled={disabled}
            />
          </label>
          <label className="col-span-2">
            <span className="field-label">Ende</span>
            <input
              type="datetime-local"
              className="field-control"
              value={single.endTime}
              onChange={(e) => setSingle((prev) => ({ ...prev, endTime: e.target.value }))}
              disabled={disabled}
            />
          </label>
          <div className="col-span-2 sm:col-span-4">
            <button type="button" onClick={addSingle} disabled={disabled} className="btn btn-outline btn-sm">
              <Plus size={16} aria-hidden="true" />
              Dienst hinzufügen
            </button>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <div>
          <p className="eyebrow">
            {drafts.length === 1 ? '1 Dienst' : `${drafts.length} Dienste`}
          </p>
          <ul className="mt-2 space-y-2">
            {drafts.map((draft, index) => (
              <li
                key={draft.key}
                className="grid grid-cols-2 items-end gap-2 rounded-md border border-line bg-surface/60 p-2.5 sm:grid-cols-[1fr_11rem_11rem_5rem_auto]"
              >
                <input
                  aria-label="Titel"
                  className="field-control-sm col-span-2 w-full sm:col-span-1"
                  value={draft.title}
                  maxLength={120}
                  onChange={(e) => updateDraft(index, { title: e.target.value })}
                  disabled={disabled}
                />
                <input
                  aria-label="Beginn"
                  type="datetime-local"
                  className="field-control-sm col-span-2 w-full sm:col-span-1"
                  value={toLocalInput(draft.startTime)}
                  onChange={(e) => updateDraft(index, { startTime: e.target.value })}
                  disabled={disabled}
                />
                <input
                  aria-label="Ende"
                  type="datetime-local"
                  className="field-control-sm col-span-2 w-full sm:col-span-1"
                  value={toLocalInput(draft.endTime)}
                  onChange={(e) => updateDraft(index, { endTime: e.target.value })}
                  disabled={disabled}
                />
                <input
                  aria-label="Personen"
                  type="number"
                  min={1}
                  max={maxCapacity}
                  className="field-control-sm w-full"
                  value={draft.capacity}
                  onChange={(e) => updateDraft(index, { capacity: number(e.target.value) })}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => removeDraft(index)}
                  disabled={disabled}
                  aria-label={`${draft.title} entfernen`}
                  className="btn btn-ghost btn-sm justify-self-end"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

