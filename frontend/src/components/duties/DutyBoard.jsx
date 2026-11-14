import { useMemo, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { formatClock, formatEventDay } from '../../lib/schedule';
import { freeSlots } from '../../lib/duties';
import { useDuties } from '../../hooks/useDuties';
import ConfirmDialog from '../ui/ConfirmDialog';
import DutyRow from './DutyRow';

/** Dienste eines Plans nach Tag gruppieren. */
function groupByDay(duties) {
  const groups = [];
  for (const duty of duties) {
    const key = duty.startTime.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.duties.push(duty);
    else groups.push({ key, duties: [duty] });
  }
  return groups;
}

/**
 * Offene Dienste und die eigenen – für alle Mitglieder.
 *
 * Die Zusage entscheidet der Server (Sperre auf dem Dienst). Der Zeitstempel
 * vom Gerät geht nur zur Nachvollziehbarkeit mit. Nach jeder Antwort steht der
 * frische Stand des Dienstes sofort in der Zeile, danach lädt die Liste neu.
 */
export default function DutyBoard() {
  const { plans, loading, error, reload } = useDuties();
  const [filter, setFilter] = useState('all');
  // Frischer Stand einzelner Dienste aus der letzten Antwort, bis die Liste
  // neu geladen ist.
  const [overrides, setOverrides] = useState({});
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);
  // Offene Rückfrage: { duty, plan, kind: 'claim' }. Übernehmen ist
  // Austragen sind verbindlich (Push an die Verwaltung, Frist zum Austragen),
  // deshalb nie mit einem einzigen versehentlichen Tipp.
  const [pending, setPending] = useState(null);

  const merged = useMemo(
    () =>
      plans.map((plan) => ({
        ...plan,
        duties: plan.duties.map((duty) => overrides[duty.id] ?? duty),
      })),
    [plans, overrides]
  );

  const mine = useMemo(
    // Nur was noch ansteht, in zeitlicher Reihenfolge – Vergangenes gehört
    // nicht in „Meine Dienste".
    () =>
      merged
        .flatMap((plan) => plan.duties.filter((duty) => duty.mine && !duty.started).map((duty) => ({ duty, plan })))
        .sort((a, b) => a.duty.startTime.localeCompare(b.duty.startTime)),
    [merged]
  );

  const visible = merged
    .map((plan) => ({
      ...plan,
      duties: filter === 'open' ? plan.duties.filter((duty) => freeSlots(duty) > 0 && !duty.started) : plan.duties,
    }))
    .filter((plan) => plan.duties.length > 0);

  const act = async (duty, method) => {
    setBusyId(duty.id);
    setNotes((prev) => ({ ...prev, [duty.id]: null }));
    try {
      const result = await apiFetch(`/api/duties/${duty.id}/claim`, {
        method,
        body: method === 'POST' ? JSON.stringify({ clientTime: new Date().toISOString() }) : undefined,
      });
      if (result?.duty) setOverrides((prev) => ({ ...prev, [duty.id]: result.duty }));
      setNotes((prev) => ({ ...prev, [duty.id]: { tone: 'success', text: result?.message ?? 'Gespeichert.' } }));
    } catch (err) {
      if (err.data?.duty) setOverrides((prev) => ({ ...prev, [duty.id]: err.data.duty }));
      setNotes((prev) => ({ ...prev, [duty.id]: { tone: 'error', text: err.message } }));
    } finally {
      setBusyId(null);
    }
    await reload();
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[duty.id];
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <span className="skeleton h-24 w-full" />
        <span className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      {mine.length > 0 && (
        <section>
          <h2 className="eyebrow">Meine Dienste</h2>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-paper">
            {mine.map(({ duty, plan }) => (
              <li key={duty.id}>
                {/* Tippen springt zum Dienst in der Liste – dort steht auch „Austragen". */}
                <button
                  type="button"
                  onClick={() => {
                    setFilter('all');
                    window.requestAnimationFrame(() =>
                      document.getElementById(`duty-${duty.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    );
                  }}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 text-left text-sm hover:bg-hsg-green-soft"
                >
                  <span className="font-semibold text-ink">{duty.title}</span>
                  <span className="text-ink-muted">
                    {formatEventDay(duty.startTime)}, {formatClock(duty.startTime)} Uhr · {plan.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
        {[
          { key: 'all', label: 'Alle' },
          { key: 'open', label: 'Mit freien Plätzen' },
        ].map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
            className={`chip chip-sm ${filter === entry.key ? 'chip-active' : ''}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="card-note">{filter === 'open' ? 'Keine freien Dienste.' : 'Keine Dienste.'}</p>
      ) : (
        visible.map((plan) => (
          <section key={plan.id} className="card">
            <h2 className="section-title text-base">{plan.title}</h2>
            {(plan.location || plan.notes) && (
              <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                {[plan.location, plan.notes].filter(Boolean).join(' · ')}
              </p>
            )}

            <div className="mt-4 space-y-5">
              {groupByDay(plan.duties).map((group) => (
                <div key={group.key}>
                  <h3 className="eyebrow">{formatEventDay(group.duties[0].startTime)}</h3>
                  <ul className="mt-2 space-y-2">
                    {group.duties.map((duty) => (
                      <DutyRow
                        key={duty.id}
                        duty={duty}
                        busy={busyId === duty.id}
                        note={notes[duty.id] ?? null}
                        onClaim={(entry) => setPending({ duty: entry, plan, kind: 'claim' })}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {pending && (
        <DutyConfirm
          {...pending}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const { duty, kind } = pending;
            setPending(null);
            if (kind === 'claim') act(duty, 'POST');
          }}
        />
      )}
    </div>
  );
}

/** Rückfrage vor Übernehmen/Austragen – mit allem, was man dafür wissen muss. */
function DutyConfirm({ duty, plan, kind, onConfirm, onClose }) {
  const claim = kind === 'claim';
  return (
    <ConfirmDialog
      title={claim ? 'Dienst übernehmen?' : 'Aus dem Dienst austragen?'}
      confirmLabel={claim ? 'Ja, übernehmen' : 'Ja, austragen'}
      tone={claim ? 'primary' : 'danger'}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="rounded-md border border-line bg-paper p-3">
        <p className="font-semibold text-ink">{duty.title}</p>
        <p>
          {formatEventDay(duty.startTime)}, {formatClock(duty.startTime)}–{formatClock(duty.endTime)} Uhr
        </p>
        <p className="text-ink-muted">{[plan.title, plan.location].filter(Boolean).join(' · ')}</p>
      </div>
      {claim ? (
        <p>
          Wichtig: Austragen kannst du dich danach nicht selbst – das geht nur über die Vereinsleitung.
        </p>
      ) : (
        <p>Dein Platz wird wieder frei und kann von anderen übernommen werden.</p>
      )}
    </ConfirmDialog>
  );
}
