import { useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';

const OPTIONS = [
  { key: 'all', label: 'Alle' },
  { key: 'admins', label: 'Nur Verwaltung' },
];

/** Vereinsweit: Wer sieht, wer einen Dienst übernommen hat? */
export default function NameVisibility() {
  const [value, setValue] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/duties/settings')
      .then((data) => active && setValue(data.assignees))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, []);

  const change = async (next) => {
    if (next === value || busy) return;
    const before = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/duties/settings', { method: 'PATCH', body: JSON.stringify({ assignees: next }) });
    } catch (err) {
      setValue(before);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3">
      <span className="text-sm font-semibold text-ink">Namen der Eingetragenen sehen</span>
      <div className="switcher" role="group" aria-label="Namen der Eingetragenen sehen">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            disabled={value === null || busy}
            onClick={() => change(option.key)}
            className={`switcher__btn ${value === option.key ? 'switcher__btn--active' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
