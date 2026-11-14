import { useState } from 'react';
import { ArrowLeft, ClipboardList, Gauge, Plus, UserRoundX } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { draftsToPayload } from '../../lib/duties';
import { formatEventDay, formatIsoDate } from '../../lib/schedule';
import { useDutyPlans } from '../../hooks/useDuties';
import DutyBuilder from './DutyBuilder';
import DutyPlanManager from './DutyPlanManager';
import NameVisibility from './NameVisibility';
import PublishBar from './PublishBar';
import StatCard from '../ui/StatCard';

/**
 * Verwaltung der Dienstpläne (Recht duties.manage): Überblick, Liste mit
 * Füllstand, neuer Plan, ein
 * Plan im Detail.
 */
export default function DutyAdmin() {
  const [past, setPast] = useState(false);
  const { plans, categories, maxCapacity, loading, error, reload } = useDutyPlans({ past });
  // null = Liste | 'new' = neuer Plan | Zahl = Plan im Detail
  const [view, setView] = useState(null);
  const [notice, setNotice] = useState(null);

  const back = async (message = null) => {
    setView(null);
    setNotice(message);
    await reload();
  };

  const totalSlots = plans.reduce((sum, p) => sum + (p.slots ?? 0), 0);
  const takenSlots = plans.reduce((sum, p) => sum + Math.min(p.taken ?? 0, p.slots ?? 0), 0);
  const openSlots = Math.max(0, totalSlots - takenSlots);
  const drafts = plans.filter((p) => p.status !== 'published').length;

  if (view === 'new') {
    return (
      <NewPlanForm
        categories={categories}
        maxCapacity={maxCapacity}
        onCancel={() => setView(null)}
        onSaved={(message) => back(message)}
      />
    );
  }

  if (typeof view === 'number') {
    return (
      <DutyPlanManager
        planId={view}
        categories={categories}
        maxCapacity={maxCapacity}
        onBack={(message) => back(message)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {notice && <div className="alert alert-success">{notice}</div>}
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      {/* Überblick: was ist offen, was ist schon besetzt? */}
      {!loading && plans.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={ClipboardList} label="Pläne" value={plans.length} hint={`${drafts} Entwurf${drafts === 1 ? '' : 'e'}`} />
          <StatCard icon={UserRoundX} label="Offen" value={openSlots} hint="freie Plätze" />
          <StatCard icon={Gauge} label="Besetzt" value={totalSlots ? `${Math.round((takenSlots / totalSlots) * 100)} %` : '–'} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="switcher" role="group" aria-label="Zeitraum">
          {[
            [false, 'Anstehend'],
            [true, 'Vergangen'],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={past === value}
              onClick={() => setPast(value)}
              className={`switcher__btn ${past === value ? 'switcher__btn--active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setView('new');
          }}
          className="btn btn-primary btn-sm"
        >
          <Plus size={16} aria-hidden="true" />
          Dienstplan
        </button>
      </div>

      {loading ? (
        <span className="skeleton h-24 w-full" />
      ) : plans.length === 0 ? (
        <p className="card-note">Keine Dienstpläne.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-paper">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setView(plan.id);
                }}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-bold tracking-[-0.01em] text-ink">
                    {plan.title}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {plan.firstStart ? formatEventDay(plan.firstStart) : 'Noch keine Dienste'}
                    {plan.lastEnd && plan.firstStart && plan.lastEnd.slice(0, 10) !== plan.firstStart.slice(0, 10)
                      ? ` – ${formatIsoDate(plan.lastEnd)}`
                      : ''}
                  </span>
                </span>
                <span className={`badge ${plan.status === 'published' ? 'badge-confirmed' : 'badge-pending'}`}>
                  {plan.status === 'published' ? 'Veröffentlicht' : 'Entwurf'}
                </span>
                {/* Füllstand: auf einen Blick, wo noch Leute fehlen. */}
                <span className="flex w-full items-center gap-3">
                  <span className="meter mt-0 flex-1" aria-hidden="true">
                    <span
                      className={`meter__fill ${plan.taken >= plan.slots ? 'bg-hsg-green' : 'bg-warn'}`}
                      style={{ width: `${plan.slots ? Math.min(100, (plan.taken / plan.slots) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-soft">
                    {plan.taken}/{plan.slots}
                    {plan.slots > plan.taken && <span className="text-warn"> · {plan.slots - plan.taken} offen</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NameVisibility />
    </div>
  );
}

/** Neuer Dienstplan: Stammdaten, Dienste, Entwurf oder sofort veröffentlichen. */
function NewPlanForm({ categories, maxCapacity, onCancel, onSaved }) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (publish) => {
    if (!title.trim()) return setError('Titel fehlt.');
    if (drafts.length === 0) return setError('Noch keine Dienste.');
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch('/api/duties/plans', {
        method: 'POST',
        body: JSON.stringify({
          title,
          location,
          notes,
          duties: draftsToPayload(drafts),
          publish,
          notify: publish && notify,
        }),
      });
      onSaved(result?.message ?? 'Gespeichert.');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft size={16} aria-hidden="true" />
        Zurück
      </button>

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="section-title text-base">Neuer Dienstplan</h2>
        <label className="block">
          <span className="field-label">Titel</span>
          <input
            className="field-control"
            value={title}
            maxLength={120}
            placeholder="Heimspieltag 18.10."
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Ort</span>
            <input
              className="field-control"
              value={location}
              maxLength={150}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="field-label">Notiz</span>
            <input
              className="field-control"
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title text-base">Dienste</h2>
        <div className="mt-4">
          <DutyBuilder
            categories={categories}
            maxCapacity={maxCapacity}
            drafts={drafts}
            onChange={setDrafts}
            disabled={busy}
          />
        </div>
      </section>

      <PublishBar
        busy={busy}
        notify={notify}
        onNotifyChange={setNotify}
        onDraft={() => save(false)}
        onPublish={() => save(true)}
      />
    </div>
  );
}
