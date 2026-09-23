import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';
import DeclineForm from './DeclineForm';

/**
 * Die ganze Mannschaft zu EINEM Termin, geteilt in „Da" und „Nicht da".
 *
 * Wird erst beim Aufklappen geladen – eine Liste mit fünfzig Terminen soll
 * nicht fünfzig Kader mitziehen.
 *
 * Trainer:innen tragen hier für andere ein (jemand sagt am Hallenrand ab und
 * meldet sich nie in der App).
 *
 * @param {{ eventId:number, viewerId:number, canManage?:boolean,
 *           busy?:boolean,
 *           onRespond:(eventId:number, status:string, reason:string|null,
 *                      userId?:number) => Promise<void> }} props
 */
export default function TeamRoster({
  eventId,
  viewerId,
  canManage = false,
  busy = false,
  onRespond,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decliningFor, setDecliningFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch(`/api/events/${eventId}`);
      setDetail(result?.event ?? null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(`/api/events/${eventId}`);
        if (!cancelled) setDetail(result?.event ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const override = async (userId, status, reason) => {
    await onRespond(eventId, status, reason, userId);
    setDecliningFor(null);
    await load();
  };

  if (loading) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <span className="skeleton h-4 w-32" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <p role="alert" className="alert alert-error mt-3">
        {error ?? 'Die Mannschaft konnte nicht geladen werden.'}
      </p>
    );
  }

  if (detail.counts.rosterSize === 0) {
    return (
      <p className="card-note mt-3">
        Für diese Mannschaft ist noch kein Kader bestätigt.
      </p>
    );
  }

  const person = (entry, absent) => (
    <li key={entry.userId} className="py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            absent ? 'bg-danger' : 'bg-hsg-green'
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {entry.jerseyNumber != null && (
            <span className="mr-1.5 font-display font-bold text-ink-muted">
              {entry.jerseyNumber}
            </span>
          )}
          {entry.firstName} {entry.lastName}
          {entry.userId === viewerId && (
            <span className="ml-1 text-xs text-ink-muted">(du)</span>
          )}
          {absent && entry.reason && (
            <span className="text-ink-muted"> · {entry.reason}</span>
          )}
        </span>

        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              absent
                ? override(entry.userId, 'ATTENDING', null)
                : setDecliningFor(
                    decliningFor === entry.userId ? null : entry.userId
                  )
            }
            className="btn btn-ghost btn-sm shrink-0"
          >
            {absent ? 'Zurückholen' : 'Abmelden'}
          </button>
        )}
      </div>

      {canManage && decliningFor === entry.userId && (
        <DeclineForm
          busy={busy}
          label={`Grund für ${entry.firstName} ${entry.lastName}`}
          onSubmit={(reason) => override(entry.userId, 'DECLINED', reason)}
          onCancel={() => setDecliningFor(null)}
        />
      )}
    </li>
  );

  return (
    <div className="mt-3 grid gap-x-6 gap-y-4 border-t border-line pt-3 sm:grid-cols-2">
      <section>
        <p className="eyebrow">Da ({detail.counts.attending})</p>
        <ul className="mt-1 divide-y divide-line">
          {detail.attending.map((entry) => person(entry, false))}
          {detail.attending.length === 0 && (
            <li className="py-1.5 text-sm text-ink-muted">Niemand</li>
          )}
        </ul>
      </section>

      <section>
        <p className="eyebrow">Nicht da ({detail.counts.declined})</p>
        <ul className="mt-1 divide-y divide-line">
          {detail.declined.map((entry) => person(entry, true))}
          {detail.declined.length === 0 && (
            <li className="py-1.5 text-sm text-ink-muted">Niemand</li>
          )}
        </ul>
      </section>
    </div>
  );
}
