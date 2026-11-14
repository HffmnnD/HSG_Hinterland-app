import { useMemo, useState } from 'react';
import { Check, Coins, Plus, Trash2 } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useApiResource } from '../../hooks/useSchedule';
import { formatIsoDate, toDateInput } from '../../lib/schedule';
import Modal from '../ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import { EmptyState, ErrorNote, Loading } from '../admin/ui/Feedback';

const select = (result) => result ?? null;

/** Cent -> „2,50 €". */
const euro = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
/** „2,50" -> 250 (null, wenn keine Zahl). */
function toCents(text) {
  const value = Number(String(text).replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/**
 * Strafenkatalog und Mannschaftskasse. Jede:r im Kader sieht den Stand und
 * trägt Strafen ein; Katalog, „bezahlt" und Löschen liegen beim Trainerteam.
 */
export default function FinesSection({ teamId }) {
  const { data, loading, error, reload } = useApiResource(`/api/fines?teamId=${teamId}`, select, null);
  const [dialog, setDialog] = useState(null); // 'fine' | 'catalog'
  const [actionError, setActionError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const perPlayer = useMemo(() => {
    const totals = new Map();
    for (const fine of data?.fines ?? []) {
      if (fine.paidAt) continue;
      const entry = totals.get(fine.userId) ?? { name: fine.name, cents: 0 };
      entry.cents += fine.amountCents;
      totals.set(fine.userId, entry);
    }
    return [...totals.values()].sort((a, b) => b.cents - a.cents);
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const run = async (path, options) => {
    setActionError(null);
    try {
      await apiFetch(path, options);
      await reload();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const remove = async (fine) => {
    if (!(await confirm({ title: 'Strafe löschen?', text: `${fine.name}: ${fine.reason} (${euro(fine.amountCents)})`, confirmLabel: 'Löschen', tone: 'danger' }))) return;
    await run(`/api/fines/${fine.id}`, { method: 'DELETE' });
  };

  // Nur offene Strafen – „bezahlt" nimmt eine Strafe aus der Liste.
  const fines = data.fines.filter((fine) => !fine.paidAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="eyebrow">Offene Strafen</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{euro(data.totals.openCents)}</p>
        </div>
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog('catalog')}>Katalog</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog('fine')}>
            <Plus size={16} aria-hidden="true" /> Strafe
          </button>
        </span>
      </div>

      <ErrorNote>{actionError}</ErrorNote>

      {perPlayer.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {perPlayer.map((entry) => (
            <li key={entry.name} className="chip chip-sm">{entry.name} · {euro(entry.cents)}</li>
          ))}
        </ul>
      )}

      {fines.length === 0 ? (
        <EmptyState icon={Coins} title="Keine offenen Strafen" />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-paper">
          {fines.map((fine) => (
            <li key={fine.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{fine.name}</span>
                <span className="block text-xs text-ink-muted">
                  {fine.reason} · {formatIsoDate(fine.finedOn)}
                  {fine.note ? ` · ${fine.note}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-ink">{euro(fine.amountCents)}</span>
              {data.canManage && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => run(`/api/fines/${fine.id}`, { method: 'PATCH', body: JSON.stringify({ paid: !fine.paidAt }) })}
                  aria-label="Als bezahlt markieren"
                  title="Bezahlt"
                >
                  <Check size={16} aria-hidden="true" className="text-hsg-green" />
                </button>
              )}
              {fine.canDelete && (
                <button type="button" className="btn btn-ghost btn-sm shrink-0 text-danger" onClick={() => remove(fine)} aria-label="Strafe löschen">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog === 'fine' && (
        <FineDialog
          teamId={teamId}
          data={data}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await reload();
          }}
        />
      )}
      {dialog === 'catalog' && <CatalogDialog teamId={teamId} data={data} onChanged={reload} onClose={() => setDialog(null)} />}
      {confirmDialog}
    </div>
  );
}

function FineDialog({ teamId, data, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [catalogId, setCatalogId] = useState(data.catalog[0] ? String(data.catalog[0].id) : 'custom');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [finedOn, setFinedOn] = useState(toDateInput());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const custom = catalogId === 'custom';

  const submit = async (event) => {
    event.preventDefault();
    const body = { userId: Number(userId), finedOn, note };
    if (custom) {
      body.reason = reason;
      body.amountCents = toCents(amount);
      if (body.amountCents === null) return setError('Bitte einen gültigen Betrag eingeben.');
    } else body.catalogId = Number(catalogId);

    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/fines?teamId=${teamId}`, { method: 'POST', body: JSON.stringify(body) });
      return await onSaved();
    } catch (err) {
      setError(err.message);
      return setBusy(false);
    }
  };

  return (
    <Modal title="Strafe eintragen" size="md" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="fine-user" className="field-label">Wer?</label>
          <select id="fine-user" className="field-control" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Bitte wählen</option>
            {data.players.map((player) => (
              <option key={player.id} value={player.id}>{player.firstName} {player.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fine-reason" className="field-label">Wofür?</label>
          <select id="fine-reason" className="field-control" value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
            {data.catalog.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label} – {euro(entry.amountCents)}</option>
            ))}
            <option value="custom">Eigener Eintrag …</option>
          </select>
        </div>
        {custom && (
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div>
              <label htmlFor="fine-custom" className="field-label">Grund</label>
              <input id="fine-custom" className="field-control" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={160} required />
            </div>
            <div>
              <label htmlFor="fine-amount" className="field-label">Betrag (€)</label>
              <input id="fine-amount" className="field-control" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2,50" required />
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="fine-date" className="field-label">Datum</label>
            <input id="fine-date" type="date" className="field-control" value={finedOn} max={toDateInput()} onChange={(e) => setFinedOn(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="fine-note" className="field-label">Notiz</label>
            <input id="fine-note" className="field-control" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Speichert …' : 'Eintragen'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CatalogDialog({ teamId, data, onChanged, onClose }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);

  const run = async (path, options) => {
    setError(null);
    try {
      await apiFetch(path, options);
      await onChanged();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  const add = async (event) => {
    event.preventDefault();
    const amountCents = toCents(amount);
    if (amountCents === null) return setError('Bitte einen gültigen Betrag eingeben.');
    if (await run(`/api/fines/catalog?teamId=${teamId}`, { method: 'POST', body: JSON.stringify({ label, amountCents }) })) {
      setLabel('');
      setAmount('');
    }
    return undefined;
  };

  return (
    <Modal title="Strafenkatalog" size="md" onClose={onClose}>
      {data.catalog.length === 0 ? (
        <p className="text-sm text-ink-muted">Der Katalog ist leer.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {data.catalog.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 text-ink">{entry.label}</span>
              <span className="shrink-0 font-bold text-ink">{euro(entry.amountCents)}</span>
              {data.canManage && (
                <button type="button" className="btn btn-ghost btn-sm shrink-0 text-danger" onClick={() => run(`/api/fines/catalog/${entry.id}`, { method: 'DELETE' })} aria-label={`${entry.label} entfernen`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.canManage && (
        <>
          <form onSubmit={add} className="mt-4 grid items-end gap-2 sm:grid-cols-[1fr_7rem_auto]">
            <div>
              <label htmlFor="cat-label" className="field-label">Neuer Grund</label>
              <input id="cat-label" className="field-control" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required />
            </div>
            <div>
              <label htmlFor="cat-amount" className="field-label">Betrag (€)</label>
              <input id="cat-amount" className="field-control" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2,00" required />
            </div>
            <button type="submit" className="btn btn-primary">Hinzufügen</button>
          </form>
          <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => run(`/api/fines/catalog/defaults?teamId=${teamId}`, { method: 'POST' })}>
            Übliche Gründe übernehmen
          </button>
        </>
      )}
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
    </Modal>
  );
}
