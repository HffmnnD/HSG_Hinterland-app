import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Baby, ClipboardList, Copy, KeyRound, Link2, Plus, Send, Unlink } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../ui/Avatar';
import { ErrorNote, Loading, SuccessNote } from '../admin/ui/Feedback';

/**
 * Familie: Kinder verknüpfen und in ihr Konto wechseln.
 *
 *   Eltern   – Kind per Code verknüpfen (der Code kommt aus dem Konto des
 *              Kindes) oder ein Kinderprofil ohne eigene E-Mail anlegen.
 *              Je Kind: „Teamplaner öffnen" und „Ins Konto wechseln".
 *   Kinder   – Code erzeugen, den die Eltern eingeben.
 */
export default function FamilySection() {
  const { switchAccount, actingAs, reloadFamily, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [ownCode, setOwnCode] = useState(null);
  const [newChild, setNewChild] = useState(null);
  // Frisch erzeugte Einladungscodes je Kind (nur in dieser Ansicht sichtbar –
  // der Server kennt nur den Hash).
  const [invites, setInvites] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch('/api/family');
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result?.message) setNotice(result.message);
      if (result?.children) {
        setData((prev) => ({ ...prev, children: result.children }));
        // Kopfzeile (Kind-Wechsler) und Profil (hasChildren) mitziehen.
        reloadFamily();
        refreshProfile();
      }
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openAs = async (child, target) => {
    setBusy(true);
    const result = await switchAccount(child.id);
    setBusy(false);
    if (result.success) navigate(target);
    else setError(result.message);
  };

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />;

  if (actingAs) {
    return <p className="text-sm text-ink-muted">Wechsle zuerst zurück in dein eigenes Konto, um die Familie zu verwalten.</p>;
  }

  return (
    <div className="space-y-5">
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}

      {/* ------------------------------------------------------ Kinder */}
      <section className="space-y-3">
        <h4 className="eyebrow">Meine Kinder</h4>
        {data.children.length === 0 ? (
          <p className="text-sm text-ink-muted">Noch kein Kind verknüpft.</p>
        ) : (
          <ul className="list-panel">
            {data.children.map((child) => (
              <li key={child.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar person={child} size="md" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {child.firstName} {child.lastName}
                      <span className="tag text-[0.65rem]">
                        <Baby size={12} aria-hidden="true" /> Kind
                      </span>
                      {child.isManaged && <span className="tag text-[0.65rem]">ohne eigenen Login</span>}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {child.teams.length > 0 ? child.teams.map((t) => t.name).join(', ') : 'Noch keine Mannschaft'}
                    </p>
                    {child.isManaged && (
                      <InviteBlock
                        child={child}
                        code={invites[child.id]}
                        busy={busy}
                        onCreate={async () => {
                          const result = await run(() =>
                            apiFetch(`/api/family/children/${child.id}/invite`, { method: 'POST' })
                          );
                          if (result?.code) setInvites((prev) => ({ ...prev, [child.id]: result.code }));
                        }}
                        onRevoke={async () => {
                          const result = await run(() =>
                            apiFetch(`/api/family/children/${child.id}/invite`, { method: 'DELETE' })
                          );
                          if (result) setInvites((prev) => ({ ...prev, [child.id]: undefined }));
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => openAs(child, '/training')}>
                    <ClipboardList size={14} aria-hidden="true" /> Teamplaner
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => openAs(child, '/')}>
                    <ArrowLeftRight size={14} aria-hidden="true" /> Ins Konto
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    title="Verknüpfung lösen"
                    aria-label={`Verknüpfung mit ${child.firstName} lösen`}
                    onClick={() =>
                      window.confirm(`Verknüpfung mit ${child.firstName} lösen?`) &&
                      run(() => apiFetch(`/api/family/children/${child.id}`, { method: 'DELETE' }))
                    }
                  >
                    <Unlink size={14} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await run(() => apiFetch('/api/family/link', { method: 'POST', body: JSON.stringify({ code }) }));
            if (result) setCode('');
          }}
        >
          <label className="sr-only" htmlFor="family-code">
            Code des Kindes
          </label>
          <input
            id="family-code"
            className="field-control min-w-0 flex-1 font-mono uppercase tracking-widest"
            placeholder="Code, z. B. AB12-CD34"
            value={code}
            maxLength={12}
            autoComplete="off"
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn btn-outline btn-sm" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length !== 8}>
            <Link2 size={14} aria-hidden="true" /> Kind verknüpfen
          </button>
        </form>
        <p className="field-hint">
          Den Code erzeugt dein Kind in seinem Konto unter „Mein Konto → Familie". Hat es kein eigenes Konto, leg ein
          Kinderprofil an.
        </p>

        {newChild ? (
          <form
            className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await run(() => apiFetch('/api/family/children', { method: 'POST', body: JSON.stringify(newChild) }));
              if (result) setNewChild(null);
            }}
          >
            <input className="field-control" placeholder="Vorname" required value={newChild.firstName} onChange={(e) => setNewChild({ ...newChild, firstName: e.target.value })} />
            <input className="field-control" placeholder="Nachname" required value={newChild.lastName} onChange={(e) => setNewChild({ ...newChild, lastName: e.target.value })} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewChild(null)}>
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                Anlegen
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewChild({ firstName: '', lastName: '' })}>
            <Plus size={14} aria-hidden="true" /> Kinderprofil ohne eigene E-Mail anlegen
          </button>
        )}
      </section>

      {/* ------------------------------------------------ Eltern / Code */}
      <section className="space-y-2 border-t border-line pt-4">
        <h4 className="eyebrow">Meine Eltern</h4>
        {data.parents.length > 0 && (
          <p className="text-sm text-ink-soft">
            Verknüpft mit {data.parents.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}. Sie sehen dein Konto und
            bekommen deine Benachrichtigungen mit.
          </p>
        )}
        {ownCode ? (
          <div className="rounded-md border border-hsg-green-line bg-hsg-green-soft p-3 text-center">
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-ink">{ownCode.code}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Gilt {ownCode.validHours} Stunden und nur einmal. Deine Eltern geben ihn in ihrem Konto ein.
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={async () => {
              const result = await run(() => apiFetch('/api/family/code', { method: 'POST' }));
              if (result) {
                setOwnCode(result);
                setNotice(null);
              }
            }}
          >
            <KeyRound size={14} aria-hidden="true" /> Code für meine Eltern erzeugen
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * Einladung für ein Kinderprofil: Mit dem Code registriert sich das Kind
 * selbst und übernimmt sein Profil (Mannschaften, Zusagen bleiben erhalten).
 */
function InviteBlock({ child, code, busy, onCreate, onRevoke }) {
  const [copied, setCopied] = useState(false);
  const link = code ? `${window.location.origin}/login?familiencode=${encodeURIComponent(code)}` : '';

  const share = async () => {
    const text = `Hallo ${child.firstName}! Mit diesem Link legst du dein eigenes Konto in der HSG-App an: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Dein HSG-Konto', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Abgebrochen oder ohne Zwischenablage – der Code steht ja sichtbar da.
    }
  };

  if (code) {
    return (
      <div className="mt-2 rounded-md border border-hsg-green-line bg-hsg-green-soft p-2.5">
        <p className="font-mono text-lg font-bold tracking-[0.2em] text-ink">{code}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {child.firstName} gibt den Code beim Registrieren ein (oder öffnet den Link). Gilt 14 Tage und nur einmal.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={share}>
            {navigator.share ? <Send size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Kopiert' : navigator.share ? 'Link teilen' : 'Link kopieren'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onRevoke}>
            Zurückziehen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCreate}>
        <KeyRound size={14} aria-hidden="true" />
        {child.inviteExpiresAt ? 'Neuen Code für eigenes Konto' : 'Eigenes Konto für ' + child.firstName}
      </button>
      {child.inviteExpiresAt && (
        <span className="text-xs text-ink-muted">
          Offener Code bis {new Date(child.inviteExpiresAt).toLocaleDateString('de-DE')}
        </span>
      )}
    </div>
  );
}
