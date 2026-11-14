import { useEffect, useState } from 'react';
import { CalendarDays, Check, Clock, HelpCircle, MapPin, Pencil, Plus, Trash2, Users, X } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useApiResource } from '../../hooks/useSchedule';
import { useTeams } from '../../hooks/useTeams';
import { formatClock, formatEventDay, formatTimeRange, isMultiDay, shiftIsoDate, toDateInput } from '../../lib/schedule';
import Modal from '../ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import { EmptyState, ErrorNote, Loading } from '../admin/ui/Feedback';

const select = (result) => ({ events: result?.events ?? [], canManage: Boolean(result?.canManage) });
const EMPTY = { events: [], canManage: false };

const ANSWERS = [
  { key: 'yes', label: 'Dabei', icon: Check, active: 'btn-primary' },
  { key: 'maybe', label: 'Vielleicht', icon: HelpCircle, active: 'btn-secondary' },
  { key: 'no', label: 'Nicht dabei', icon: X, active: 'btn-danger' },
];
const ANSWER_LABEL = { yes: 'Dabei', maybe: 'Vielleicht', no: 'Nicht dabei' };

const when = (event) =>
  isMultiDay(event.startTime, event.endTime)
    ? `${formatEventDay(event.startTime)} – ${formatEventDay(event.endTime)}`
    : `${formatEventDay(event.startTime)} · ${formatTimeRange(event.startTime, event.endTime)}`;

/**
 * Vereinstermine mit Abfrage: Wer kommt zum Sommerfest, zum Helferabend, zur
 * Versammlung? Jede:r antwortet mit einem Tipp; die Planung (Recht
 * events.manage) legt Termine an und sieht die Namensliste.
 */
export default function ClubEventsSection() {
  const [past, setPast] = useState(false);
  const today = toDateInput();
  const path = past
    ? `/api/club-events?from=${shiftIsoDate(today, -365)}&to=${shiftIsoDate(today, -1)}`
    : `/api/club-events?from=${today}`;
  const { data, loading, error, reload } = useApiResource(path, select, EMPTY);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const events = past ? [...data.events].reverse() : data.events;

  const run = async (action) => {
    setActionError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const remove = async (event) => {
    if (!(await confirm({ title: 'Termin löschen?', text: `„${event.title}" und alle Rückmeldungen werden entfernt.`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    await run(() => apiFetch(`/api/club-events/${event.id}`, { method: 'DELETE' }));
  };

  const toggleCancel = async (event) => {
    const cancelled = !event.cancelledAt;
    if (cancelled && !(await confirm({ title: 'Termin absagen?', text: `„${event.title}" bleibt sichtbar und wird als abgesagt markiert.`, confirmLabel: 'Absagen', tone: 'danger' }))) return;
    await run(() => apiFetch(`/api/club-events/${event.id}/cancel`, { method: 'POST', body: JSON.stringify({ cancelled }) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segment w-60" role="tablist" aria-label="Zeitraum">
          <button type="button" role="tab" aria-selected={!past} className={`segment__btn ${!past ? 'segment__btn--active' : ''}`} onClick={() => setPast(false)}>Anstehend</button>
          <button type="button" role="tab" aria-selected={past} className={`segment__btn ${past ? 'segment__btn--active' : ''}`} onClick={() => setPast(true)}>Vergangen</button>
        </div>
        {data.canManage && (
          <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={() => setEditing({})}>
            <Plus size={16} aria-hidden="true" /> Neuer Termin
          </button>
        )}
      </div>

      <ErrorNote>{error ?? actionError}</ErrorNote>

      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title={past ? 'Keine vergangenen Vereinstermine' : 'Keine anstehenden Vereinstermine'} />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="panel">
              <div className="panel__body space-y-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className={`section-title text-base ${event.cancelledAt ? 'line-through opacity-70' : ''}`}>{event.title}</h3>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" /> {when(event)}</span>
                      {event.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> {event.location}</span>}
                    </p>
                  </div>
                  {data.canManage && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(event)} aria-label={`${event.title} bearbeiten`}><Pencil size={16} aria-hidden="true" /></button>
                      <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => remove(event)} aria-label={`${event.title} löschen`}><Trash2 size={16} aria-hidden="true" /></button>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {event.cancelledAt && <span className="badge badge-declined">Abgesagt{event.cancelReason ? `: ${event.cancelReason}` : ''}</span>}
                  {event.audience === 'teams' && event.teams.map((team) => <span key={team.id} className="badge badge-neutral">{team.name}</span>)}
                  {event.maxParticipants !== null && <span className="badge badge-neutral">{event.spotsLeft} von {event.maxParticipants} Plätzen frei</span>}
                </div>

                {event.description && <p className="whitespace-pre-line break-words text-sm text-ink-soft">{event.description}</p>}

                {event.rsvpEnabled && !event.cancelledAt && (
                  <Rsvp event={event} onSaved={reload} onError={setActionError} />
                )}

                {event.rsvpEnabled && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm text-ink-soft">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={14} aria-hidden="true" />
                      {event.summary.yes + event.summary.guests} dabei
                      {event.summary.guests > 0 && ` (davon ${event.summary.guests} Begleitung)`} · {event.summary.maybe} vielleicht · {event.summary.no} nicht dabei
                    </span>
                    {data.canManage && (
                      <span className="ml-auto flex gap-1.5">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setDetail(event.id)}>Rückmeldungen</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleCancel(event)}>{event.cancelledAt ? 'Absage zurücknehmen' : 'Absagen'}</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EventDialog
          event={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {detail && <ResponsesDialog id={detail} onClose={() => setDetail(null)} />}
      {confirmDialog}
    </div>
  );
}

/** Antwortknöpfe eines Termins, mit Begleitpersonen und Notiz. */
function Rsvp({ event, onSaved, onError }) {
  const mine = event.myResponse;
  const [guests, setGuests] = useState(mine?.guests ?? 0);
  const [note, setNote] = useState(mine?.note ?? '');
  const [busy, setBusy] = useState(false);

  const answer = async (status, extra = {}) => {
    setBusy(true);
    onError(null);
    try {
      await apiFetch(`/api/club-events/${event.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ status, guests: status === 'yes' ? guests : 0, note, ...extra }),
      });
      await onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!event.responseOpen) {
    return (
      <p className="card-note">
        Die Anmeldung ist geschlossen.{mine ? ` Deine Antwort: ${ANSWER_LABEL[mine.status]}.` : ' Du hast nicht geantwortet.'}
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface/60 p-3">
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
        {mine ? `Deine Antwort: ${ANSWER_LABEL[mine.status]}` : 'Bist du dabei?'}
        {event.responseDeadline && (
          <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-muted">
            <Clock size={12} aria-hidden="true" /> Anmeldung bis {formatEventDay(event.responseDeadline)}, {formatClock(event.responseDeadline)} Uhr
          </span>
        )}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ANSWERS.map(({ key, label, icon: Icon, active }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-pressed={mine?.status === key}
            onClick={() => answer(key)}
            className={`btn btn-sm ${mine?.status === key ? active : 'btn-outline'}`}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {mine && (
        <div className="flex flex-wrap items-end gap-2">
          {event.allowGuests && mine.status === 'yes' && (
            <label className="text-xs text-ink-muted">
              Begleitung
              <select className="field-control-sm mt-1 block" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'keine' : `+ ${n}`}</option>)}
              </select>
            </label>
          )}
          <label className="min-w-0 flex-1 text-xs text-ink-muted">
            Notiz (freiwillig)
            <input className="field-control-sm mt-1 block w-full" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="z. B. bringe Salat mit" />
          </label>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => answer(mine.status)}>Speichern</button>
        </div>
      )}
    </div>
  );
}

function ResponsesDialog({ id, onClose }) {
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/club-events/${id}`)
      .then((data) => !cancelled && setEvent(data.event))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Modal title={event ? `Rückmeldungen – ${event.title}` : 'Rückmeldungen'} size="md" onClose={onClose}>
      <ErrorNote>{error}</ErrorNote>
      {!event && !error && <Loading />}
      {event &&
        ['yes', 'maybe', 'no'].map((status) => {
          const people = (event.responses ?? []).filter((r) => r.status === status);
          return (
            <section key={status} className="mb-4">
              <h3 className="eyebrow mb-1.5">{ANSWER_LABEL[status]} ({people.length})</h3>
              {people.length === 0 ? (
                <p className="text-sm text-ink-muted">Niemand.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {people.map((person) => (
                    <li key={person.userId} className="px-3 py-2 text-sm">
                      <span className="font-semibold text-ink">{person.name}</span>
                      {person.guests > 0 && <span className="text-ink-muted"> + {person.guests}</span>}
                      {person.note && <span className="block text-xs text-ink-muted">{person.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </Modal>
  );
}

const toInput = (value) => (value ? value.slice(0, 16) : '');

function EventDialog({ event, onClose, onSaved }) {
  const { teams } = useTeams();
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    location: event?.location ?? '',
    startTime: toInput(event?.startTime),
    endTime: toInput(event?.endTime),
    audience: event?.audience ?? 'club',
    teamIds: event?.teams.map((team) => team.id) ?? [],
    rsvpEnabled: event?.rsvpEnabled ?? true,
    responseDeadline: toInput(event?.responseDeadline),
    allowGuests: event?.allowGuests ?? false,
    maxParticipants: event?.maxParticipants ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleTeam = (id) =>
    setForm((old) => ({ ...old, teamIds: old.teamIds.includes(id) ? old.teamIds.filter((t) => t !== id) : [...old.teamIds, id] }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(event ? `/api/club-events/${event.id}` : '/api/club-events', {
        method: event ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, responseDeadline: form.responseDeadline || null, maxParticipants: form.maxParticipants || null }),
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={event ? 'Vereinstermin bearbeiten' : 'Neuer Vereinstermin'} size="lg" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="ce-title" className="field-label">Titel</label>
          <input id="ce-title" className="field-control" value={form.title} onChange={set('title')} maxLength={120} required placeholder="z. B. Sommerfest" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ce-start" className="field-label">Beginn</label>
            <input id="ce-start" type="datetime-local" className="field-control" value={form.startTime} onChange={set('startTime')} required />
          </div>
          <div>
            <label htmlFor="ce-end" className="field-label">Ende</label>
            <input id="ce-end" type="datetime-local" className="field-control" value={form.endTime} min={form.startTime} onChange={set('endTime')} required />
          </div>
        </div>
        <div>
          <label htmlFor="ce-location" className="field-label">Ort</label>
          <input id="ce-location" className="field-control" value={form.location} onChange={set('location')} maxLength={150} />
        </div>
        <div>
          <label htmlFor="ce-description" className="field-label">Beschreibung</label>
          <textarea id="ce-description" className="field-control" rows={4} value={form.description} onChange={set('description')} maxLength={4000} />
        </div>

        <fieldset className="fieldset space-y-3">
          <legend>Für wen?</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`chip ${form.audience === 'club' ? 'chip-active' : ''}`} onClick={() => setForm((old) => ({ ...old, audience: 'club' }))}>Ganzer Verein</button>
            <button type="button" className={`chip ${form.audience === 'teams' ? 'chip-active' : ''}`} onClick={() => setForm((old) => ({ ...old, audience: 'teams' }))}>Bestimmte Mannschaften</button>
          </div>
          {form.audience === 'teams' && (
            <div className="flex flex-wrap gap-1.5">
              {teams.map((team) => (
                <button key={team.id} type="button" aria-pressed={form.teamIds.includes(team.id)} className={`chip chip-sm ${form.teamIds.includes(team.id) ? 'chip-active' : ''}`} onClick={() => toggleTeam(team.id)}>
                  {team.name}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="fieldset space-y-3">
          <legend>Abfrage</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.rsvpEnabled} onChange={set('rsvpEnabled')} className="h-4 w-4 accent-[var(--c-green)]" />
            Rückmeldung abfragen (dabei, vielleicht, nicht dabei)
          </label>
          {form.rsvpEnabled && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ce-deadline" className="field-label">Anmeldefrist</label>
                  <input id="ce-deadline" type="datetime-local" className="field-control" value={form.responseDeadline} max={form.startTime} onChange={set('responseDeadline')} />
                  <p className="field-hint">Leer = bis zum Beginn.</p>
                </div>
                <div>
                  <label htmlFor="ce-max" className="field-label">Plätze</label>
                  <input id="ce-max" type="number" min="1" max="5000" className="field-control" value={form.maxParticipants} onChange={set('maxParticipants')} placeholder="unbegrenzt" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.allowGuests} onChange={set('allowGuests')} className="h-4 w-4 accent-[var(--c-green)]" />
                Begleitpersonen erlauben
              </label>
            </>
          )}
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button>
        </div>
      </form>
    </Modal>
  );
}
