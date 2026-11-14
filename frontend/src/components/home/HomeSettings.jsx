import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ErrorNote, SuccessNote } from '../admin/ui/Feedback';
import { HOME_WIDGETS, resolveLayout } from './widgets';

/**
 * Startseite anpassen: Kacheln ein-/ausblenden und umsortieren. Gespeichert
 * am Konto (gilt auf allen Geräten). Pfeil-Knöpfe statt Ziehen: funktioniert
 * am Handy mit dem Daumen, mit Tastatur und mit Screenreader gleich gut.
 */
export default function HomeSettings({ onSaved }) {
  const { user, refreshProfile } = useAuth();
  const initial = resolveLayout(user?.homeLayout);
  const [order, setOrder] = useState(initial.order);
  const [hidden, setHidden] = useState(initial.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const move = (index, delta) =>
    setOrder((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const toggle = (key) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async (layout) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/me/home', { method: 'PUT', body: JSON.stringify(layout) });
      await refreshProfile();
      setNotice('Startseite gespeichert.');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    const def = resolveLayout(null);
    setOrder(def.order);
    setHidden(def.hidden);
    save({ order: def.order, hidden: [] });
  };

  return (
    <div className="space-y-3">
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}
      <ul className="list-panel">
        {order.map((key, index) => {
          const widget = HOME_WIDGETS.find((w) => w.key === key);
          const off = hidden.has(key);
          return (
            <li key={key} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                onClick={() => toggle(key)}
                className={`btn btn-ghost btn-sm ${off ? 'text-ink-muted' : 'text-hsg-green-dark'}`}
                aria-label={`${widget.label} ${off ? 'einblenden' : 'ausblenden'}`}
              >
                {off ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <span className={`min-w-0 flex-1 ${off ? 'opacity-50' : ''}`}>
                <span className="block text-sm font-bold text-ink">{widget.label}</span>
                <span className="block truncate text-xs text-ink-muted">{widget.hint}</span>
              </span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${widget.label} nach oben`}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`${widget.label} nach unten`}>
                <ArrowDown size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
          <RotateCcw size={14} aria-hidden="true" /> Standard
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => save({ order, hidden: [...hidden] })} disabled={busy}>
          {busy ? 'Speichert …' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
