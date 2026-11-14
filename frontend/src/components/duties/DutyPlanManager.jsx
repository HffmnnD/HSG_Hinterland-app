import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { draftsToPayload, slotsLabel, toLocalInput } from '../../lib/duties';
import { formatClock, formatEventDay } from '../../lib/schedule';
import { useDutyPlan } from '../../hooks/useDuties';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import DutyBuilder from './DutyBuilder';
import PublishBar from './PublishBar';

/**
 * Ein Dienstplan in der Verwaltung: Stammdaten, Dienste mit Eingetragenen,
 * weitere Dienste, veröffentlichen, löschen.
 */
export default function DutyPlanManager({ planId, categories, maxCapacity, onBack }) {
  const { plan, loading, error: loadError, reload } = useDutyPlan(planId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [notify, setNotify] = useState(true);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingDuty, setEditingDuty] = useState(null);
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState([]);
  // { title, text, action } für die Rückfrage
  const [confirm, setConfirm] = useState(null);

  const run = async (action, { reloadAfter = true } = {}) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result?.message ?? 'Gespeichert.');
      if (reloadAfter) await reload();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading && !plan) return <span className="skeleton h-40 w-full" />;
  if (!plan) {
    return (
      <div className="space-y-4">
        <BackButton onBack={() => onBack()} />
        <div role="alert" className="alert alert-error">
          {loadError ?? 'Dienstplan nicht gefunden.'}
        </div>
      </div>
    );
  }

  const isDraft = plan.status === 'draft';

  const publish = () =>
    run(() =>
      apiFetch(`/api/duties/plans/${plan.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ notify }),
      })
    );

  const addDuties = async () => {
    if (drafts.length === 0) return setError('Noch keine Dienste.');
    const ok = await run(() =>
      apiFetch(`/api/duties/plans/${plan.id}/duties`, {
        method: 'POST',
        body: JSON.stringify({ duties: draftsToPayload(drafts), notify: !isDraft && notify }),
      })
    );
    if (ok) {
      setDrafts([]);
      setAdding(false);
    }
  };

  const askDeletePlan = () =>
    setConfirm({
      title: 'Dienstplan löschen?',
      text:
        plan.duties.some((duty) => duty.taken > 0) && !isDraft
          ? 'Alle Eingetragenen kommender Dienste werden benachrichtigt.'
          : null,
      action: async () => {
        setBusy(true);
        try {
          const result = await apiFetch(`/api/duties/plans/${plan.id}`, { method: 'DELETE' });
          onBack(result?.message);
        } catch (err) {
          setError(err.message);
          setBusy(false);
        }
      },
    });

  const askDeleteDuty = (duty) =>
    setConfirm({
      title: `„${duty.title}" löschen?`,
      text: duty.taken > 0 && !isDraft ? 'Die Eingetragenen werden benachrichtigt.' : null,
      action: () => run(() => apiFetch(`/api/duties/${duty.id}`, { method: 'DELETE' })),
    });

  const askUnassign = (duty, person) =>
    setConfirm({
      title: `${person.firstName} ${person.lastName} austragen?`,
      text: duty.title,
      action: () =>
        run(() => apiFetch(`/api/duties/${duty.id}/assignments/${person.id}`, { method: 'DELETE' })),
    });

  return (
    <div className="space-y-5">
      <BackButton onBack={() => onBack()} />

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* ------------------------------------------------ Stammdaten */}
      <section className="card">
        {editingPlan ? (
          <PlanFieldsForm
            plan={plan}
            busy={busy}
            onCancel={() => setEditingPlan(false)}
            onSubmit={async (fields) => {
              const ok = await run(() =>
                apiFetch(`/api/duties/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(fields) })
              );
              if (ok) setEditingPlan(false);
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="section-title text-base">{plan.title}</h2>
                <span className={`badge ${isDraft ? 'badge-pending' : 'badge-confirmed'}`}>
                  {isDraft ? 'Entwurf' : 'Veröffentlicht'}
                </span>
              </div>
              {(plan.location || plan.notes) && (
                <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                  {[plan.location, plan.notes].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => setEditingPlan(true)} className="btn btn-ghost btn-sm">
                <Pencil size={15} aria-hidden="true" />
                Bearbeiten
              </button>
              <button type="button" onClick={askDeletePlan} disabled={busy} className="btn btn-ghost btn-sm text-danger hover:text-danger">
                <Trash2 size={15} aria-hidden="true" />
                Löschen
              </button>
            </div>
          </div>
        )}

        {isDraft && (
          <div className="mt-4">
            <PublishBar busy={busy} notify={notify} onNotifyChange={setNotify} onPublish={publish} />
          </div>
        )}
      </section>

      {/* --------------------------------------------------- Dienste */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title text-base">Dienste</h2>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-outline btn-sm">
              Dienste hinzufügen
            </button>
          )}
        </div>

        {adding && (
          <div className="mt-4 rounded-md border border-line p-4">
            <DutyBuilder
              categories={categories}
              maxCapacity={maxCapacity}
              drafts={drafts}
              onChange={setDrafts}
              disabled={busy}
            />
            {!isDraft && (
              <label className="mt-4 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                  className="h-5 w-5 accent-hsg-green"
                  disabled={busy}
                />
                Helfer per Push benachrichtigen
              </label>
            )}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={addDuties} disabled={busy || drafts.length === 0} className="btn btn-primary btn-sm">
                Hinzufügen
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDrafts([]);
                }}
                className="btn btn-ghost btn-sm"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {plan.duties.length === 0 ? (
          <p className="card-note mt-4">Noch keine Dienste.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {plan.duties.map((duty) =>
              editingDuty === duty.id ? (
                <li key={duty.id}>
                  <DutyEditForm
                    duty={duty}
                    maxCapacity={maxCapacity}
                    busy={busy}
                    onCancel={() => setEditingDuty(null)}
                    onSubmit={async (fields) => {
                      const ok = await run(() =>
                        apiFetch(`/api/duties/${duty.id}`, { method: 'PATCH', body: JSON.stringify(fields) })
                      );
                      if (ok) setEditingDuty(null);
                    }}
                  />
                </li>
              ) : (
                <li key={duty.id} className={`rounded-md border border-line p-3 ${duty.started ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-muted">
                        {formatEventDay(duty.startTime)}, {formatClock(duty.startTime)} – {formatClock(duty.endTime)}
                      </p>
                      <p className="font-display text-sm font-bold tracking-[-0.01em] text-ink">{duty.title}</p>
                    </div>
                    <span className="text-sm font-semibold text-ink-soft">{slotsLabel(duty)}</span>
                    <span className="flex">
                      <button
                        type="button"
                        onClick={() => setEditingDuty(duty.id)}
                        disabled={busy}
                        aria-label={`${duty.title} bearbeiten`}
                        className="btn btn-ghost btn-sm"
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => askDeleteDuty(duty)}
                        disabled={busy}
                        aria-label={`${duty.title} löschen`}
                        className="btn btn-ghost btn-sm text-danger hover:text-danger"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  {duty.assignees.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {duty.assignees.map((person) => (
                        <li key={person.id} className="tag">
                          <Avatar person={person} size="xs" />
                          {person.firstName} {person.lastName}
                          <button
                            type="button"
                            onClick={() => askUnassign(duty, person)}
                            disabled={busy}
                            aria-label={`${person.firstName} ${person.lastName} austragen`}
                            className="-mr-1 text-ink-muted hover:text-danger"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </section>

      {confirm && (
        <Modal title={confirm.title} size="sm" onClose={() => setConfirm(null)}>
          {confirm.text && <p className="text-sm text-ink-soft">{confirm.text}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="btn btn-ghost btn-sm">
              Abbrechen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const { action } = confirm;
                setConfirm(null);
                await action();
              }}
              className="btn btn-danger btn-sm"
            >
              Bestätigen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BackButton({ onBack }) {
  return (
    <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ml-2">
      <ArrowLeft size={16} aria-hidden="true" />
      Alle Dienstpläne
    </button>
  );
}

function PlanFieldsForm({ plan, busy, onSubmit, onCancel }) {
  const [title, setTitle] = useState(plan.title);
  const [location, setLocation] = useState(plan.location ?? '');
  const [notes, setNotes] = useState(plan.notes ?? '');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, location, notes });
      }}
    >
      <label className="block">
        <span className="field-label">Titel</span>
        <input className="field-control" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Ort</span>
          <input className="field-control" value={location} maxLength={150} onChange={(e) => setLocation(e.target.value)} disabled={busy} />
        </label>
        <label className="block">
          <span className="field-label">Notiz</span>
          <input className="field-control" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
          Speichern
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function DutyEditForm({ duty, maxCapacity, busy, onSubmit, onCancel }) {
  const [title, setTitle] = useState(duty.title);
  const [startTime, setStartTime] = useState(toLocalInput(duty.startTime));
  const [endTime, setEndTime] = useState(toLocalInput(duty.endTime));
  const [capacity, setCapacity] = useState(duty.capacity);

  const submit = (e) => {
    e.preventDefault();
    const fields = { title, capacity: Number(capacity) || 1 };
    // Zeiten nur schicken, wenn sie sich geändert haben: Ein laufender
    // Dienst soll sich noch umbenennen lassen.
    if (startTime !== toLocalInput(duty.startTime)) fields.startTime = startTime;
    if (endTime !== toLocalInput(duty.endTime)) fields.endTime = endTime;
    onSubmit(fields);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 rounded-md border border-hsg-green p-3 sm:grid-cols-[1fr_11rem_11rem_5rem]">
      <input aria-label="Titel" className="field-control-sm col-span-2 w-full sm:col-span-1" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      <input aria-label="Beginn" type="datetime-local" className="field-control-sm col-span-2 w-full sm:col-span-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={busy} />
      <input aria-label="Ende" type="datetime-local" className="field-control-sm col-span-2 w-full sm:col-span-1" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={busy} />
      <input aria-label="Personen" type="number" min={duty.taken || 1} max={maxCapacity} className="field-control-sm w-full" value={capacity} onChange={(e) => setCapacity(e.target.value)} disabled={busy} />
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
          Speichern
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Abbrechen
        </button>
      </div>
    </form>
  );
}
