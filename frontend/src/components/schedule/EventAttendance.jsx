import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { sourceHint } from '../../lib/schedule';
import DeclineForm from './DeclineForm';

/**
 * Vollständige Kaderliste eines Termins – „Wer ist da? Wer fehlt?".
 *
 * Wird erst beim Aufklappen geladen. Trainer:innen können hier die
 * Anwesenheit jeder Person übersteuern (jemand sagt am Hallenrand ab, meldet
 * sich aber nicht in der App).
 *
 * @param {{ eventId:number, viewerId:number, canManage?:boolean,
 *           busy?:boolean,
 *           onRespond:(eventId:number, status:string, reason:string|null,
 *                      userId?:number) => Promise<void> }} props
 */
export default function EventAttendance({
  eventId,
  viewerId,
  canManage = false,
  busy = false,
  onRespond,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // userId, für die gerade ein Abmeldegrund eingegeben wird.
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
        <span className="skeleton h-4 w-40" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <p role="alert" className="alert alert-error mt-3">
        {error ?? 'Der Kader konnte nicht geladen werden.'}
      </p>
    );
  }

  const renderPerson = (entry) => (
    <li key={entry.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`status-dot ${
            entry.status === 'DECLINED'
              ? entry.source === 'ABSENCE'
                ? 'bg-warn'
                : 'bg-danger'
              : 'bg-hsg-green'
          }`}
          aria-hidden="true"
        />
        <span className="truncate text-sm text-ink">
          {entry.jerseyNumber != null && (
            <span className="mr-1.5 font-display font-bold text-ink-muted">
              {entry.jerseyNumber}
            </span>
          )}
          {entry.firstName} {entry.lastName}
          {entry.userId === viewerId && (
            <span className="ml-1 text-xs text-ink-muted">(du)</span>
          )}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {entry.reason && <span className="text-ink-soft">{entry.reason}</span>}
        {entry.reasonHidden && <span>Grund nur für das Trainerteam</span>}
        {!entry.reason && !entry.reasonHidden && sourceHint(entry.source)}
      </span>

      {canManage && (
        <span className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => override(entry.userId, 'ATTENDING', null)}
            className={`chip chip-sm ${
              entry.status === 'ATTENDING' ? 'chip-active' : ''
            }`}
            title="Als anwesend eintragen"
          >
            Da
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setDecliningFor(
                decliningFor === entry.userId ? null : entry.userId
              )
            }
            aria-expanded={decliningFor === entry.userId}
            className={`chip chip-sm ${
              entry.status === 'DECLINED' ? 'chip-pending' : ''
            }`}
            title="Als abwesend eintragen"
          >
            Nicht da
          </button>
        </span>
      )}

      {canManage && decliningFor === entry.userId && (
        <div className="w-full">
          <DeclineForm
            busy={busy}
            label={`Grund für ${entry.firstName} ${entry.lastName}`}
            initialReason={entry.source === 'ABSENCE' ? '' : entry.reason ?? ''}
            onSubmit={(reason) => override(entry.userId, 'DECLINED', reason)}
            onCancel={() => setDecliningFor(null)}
          />
        </div>
      )}
    </li>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      {detail.counts.rosterSize === 0 ? (
        <p className="card-note">
          Für diese Mannschaft ist noch kein Kader bestätigt. Sobald
          Spieler:innen bestätigt sind, erscheinen sie hier.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <section>
            <p className="eyebrow">
              Dabei ({detail.counts.attending})
            </p>
            <ul className="mt-1 divide-y divide-line">
              {detail.attending.map(renderPerson)}
              {detail.attending.length === 0 && (
                <li className="py-2 text-sm text-ink-muted">Niemand.</li>
              )}
            </ul>
          </section>

          <section>
            <p className="eyebrow">Nicht da ({detail.counts.declined})</p>
            <ul className="mt-1 divide-y divide-line">
              {detail.declined.map(renderPerson)}
              {detail.declined.length === 0 && (
                <li className="py-2 text-sm text-ink-muted">
                  Keine Absagen – der gesamte Kader ist dabei.
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      {canManage && detail.counts.rosterSize > 0 && (
        <p className="field-hint">
          Über „Da" und „Nicht da" trägst du die Anwesenheit für andere ein.
          Wer selbst antwortet, überschreibt deinen Eintrag wieder.
        </p>
      )}
    </div>
  );
}
