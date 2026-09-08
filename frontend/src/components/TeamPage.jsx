import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useTeams } from '../hooks/useTeams';
import { relationLabel, relationLabelPlural } from '../lib/participation';
import { roleLabel } from '../lib/roles';

// Reihenfolge im Kader (Trainer:innen zuerst)
const SECTIONS = ['coach', 'player', 'fan'];
// Reihenfolge im Auswahlfeld „Mitglied hinzufügen“ (häufigster Fall zuerst)
const ADD_RELATIONS = ['player', 'coach', 'fan'];

// `key={code}` sorgt dafür, dass beim Wechsel der Mannschaft der komplette
// Zustand neu initialisiert wird – ohne setState im Effekt-Body.
export default function TeamPage() {
  const { code } = useParams();
  return <TeamView key={code} code={code} />;
}

function TeamView({ code }) {
  const { teams: allTeams } = useTeams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  // Formular „Mitglied hinzufügen“
  const [candidates, setCandidates] = useState([]);
  const [addRelation, setAddRelation] = useState('player');
  const [addUserId, setAddUserId] = useState('');

  const load = useCallback(async () => {
    const result = await apiFetch(`/api/teams/${encodeURIComponent(code)}`);
    setData(result);
    return result;
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(`/api/teams/${encodeURIComponent(code)}`);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const canManage = data?.canManage ?? false;

  // Kandidatenliste für den gewählten Beziehungstyp nachladen.
  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch(
          `/api/teams/${encodeURIComponent(code)}/candidates?relationType=${addRelation}`
        );
        if (!cancelled) {
          setCandidates(result?.candidates ?? []);
          setAddUserId('');
        }
      } catch {
        if (!cancelled) setCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, addRelation, canManage, data]);

  // Führt eine Verwaltungsaktion aus und lädt danach neu. Zeigt bevorzugt die
  // Meldung aus der Server-Antwort (z. B. „… hat jetzt die Rolle Trainer:in").
  const run = async (action, fallbackMessage) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      await load();
      setNotice(result?.message || fallbackMessage || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event) => {
    event.preventDefault();
    if (!addUserId) return;
    run(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}/members`, {
          method: 'POST',
          body: JSON.stringify({
            userId: Number(addUserId),
            relationType: addRelation,
          }),
        }),
      'Mitglied hinzugefügt.'
    );
  };

  const handleConfirm = (userId, relationType, name) =>
    run(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}/confirm?relationType=${relationType}`,
          { method: 'POST' }
        ),
      `${name} bestätigt.`
    );

  const handleReject = (userId, relationType, name) =>
    run(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}?relationType=${relationType}`,
          { method: 'DELETE' }
        ),
      `Anfrage von ${name} abgelehnt.`
    );

  const handleRemove = (userId, relationType, name) =>
    run(
      () =>
        apiFetch(
          `/api/teams/${encodeURIComponent(code)}/members/${userId}?relationType=${relationType}`,
          { method: 'DELETE' }
        ),
      `${name} entfernt.`
    );

  const handleCallUp = (userId, targetTeamCode, name) =>
    run(
      () =>
        apiFetch(`/api/teams/${encodeURIComponent(code)}/callup`, {
          method: 'POST',
          body: JSON.stringify({ userId, targetTeamCode }),
        }),
      `Anfrage für ${name} an ${targetTeamCode} gesendet.`
    );

  if (loading) {
    return (
      <Shell code={code}>
        <p className="text-sm text-slate-400">Wird geladen …</p>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell code={code}>
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-200"
        >
          {error ?? 'Mannschaft konnte nicht geladen werden.'}
        </div>
      </Shell>
    );
  }

  const { team, members, counts } = data;
  const pendingMembers = data.pendingMembers ?? [];
  const otherTeams = allTeams.filter((t) => t.code !== team.code);

  return (
    <Shell code={team.code} name={team.name} canManage={canManage}>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      )}

      {/* Offene Beitrittsanfragen – ganz oben, nur für Verwaltung */}
      {canManage && pendingMembers.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            Offene Beitrittsanfragen
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs">
              {pendingMembers.length}
            </span>
          </h2>
          <ul className="mt-3 divide-y divide-amber-500/20 overflow-hidden rounded-xl border border-amber-500/20">
            {pendingMembers.map((member) => {
              const name = `${member.firstName} ${member.lastName}`;
              return (
                <li
                  key={`pending-${member.id}-${member.relationType}`}
                  className="flex flex-col gap-2 bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <span className="font-medium text-slate-100">{name}</span>
                    <span className="ml-2 text-slate-400">
                      möchte als {relationLabel(member.relationType)} beitreten
                    </span>
                    {member.email && (
                      <span className="block truncate text-xs text-slate-500">
                        {member.email}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleConfirm(member.id, member.relationType, name)
                      }
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                    >
                      Bestätigen
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleReject(member.id, member.relationType, name)
                      }
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
                    >
                      Ablehnen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Mannschaftsinfos */}
      <div
        className={`grid gap-4 sm:grid-cols-3 ${
          canManage && pendingMembers.length > 0 ? 'mt-6' : ''
        }`}
      >
        {SECTIONS.map((relation) => (
          <div
            key={relation}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <h2 className="text-sm font-semibold text-slate-300">
              {relationLabelPlural(relation)}
            </h2>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {counts[relation]}
            </p>
          </div>
        ))}
      </div>

      {/* Verwaltung nur für Trainer:innen dieser Mannschaft / Admins */}
      {canManage && (
        <form
          onSubmit={handleAdd}
          className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5"
        >
          <h2 className="text-sm font-semibold text-emerald-200">
            Mitglied hinzufügen
          </h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={addRelation}
              onChange={(e) => setAddRelation(e.target.value)}
              disabled={busy}
              aria-label="Rolle in der Mannschaft"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {ADD_RELATIONS.map((relation) => (
                <option key={relation} value={relation}>
                  {relationLabelPlural(relation)}
                </option>
              ))}
            </select>

            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              disabled={busy || candidates.length === 0}
              aria-label="Mitglied auswählen"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="">
                {candidates.length === 0
                  ? 'Keine passenden Mitglieder'
                  : 'Mitglied wählen …'}
              </option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} ({roleLabel(c.role)})
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={busy || !addUserId}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hinzufügen
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Manuell hinzugefügte Mitglieder sind sofort bestätigt.
          </p>
        </form>
      )}

      {/* Kader (nur bestätigte Mitglieder) */}
      {SECTIONS.map((relation) => (
        <section key={relation} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {relationLabelPlural(relation)}
          </h2>

          {members[relation].length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Noch niemand zugeordnet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800">
              {members[relation].map((member) => {
                const name = `${member.firstName} ${member.lastName}`;
                return (
                  <li
                    key={`${relation}-${member.id}`}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {name}
                        <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-400">
                          {roleLabel(member.role)}
                        </span>
                      </p>
                      {member.email && (
                        <p className="truncate text-xs text-slate-500">
                          {member.email}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex shrink-0 items-center gap-2">
                        {relation === 'player' && otherTeams.length > 0 && (
                          <select
                            value=""
                            disabled={busy}
                            aria-label={`${name} hochrufen`}
                            onChange={(e) => {
                              if (e.target.value) {
                                handleCallUp(member.id, e.target.value, name);
                              }
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"
                            title="Sendet eine Anfrage an die Zielmannschaft – deren Trainer:in bestätigt sie."
                          >
                            <option value="">Hochrufen zu …</option>
                            {otherTeams.map((t) => (
                              <option key={t.id} value={t.code}>
                                {t.code}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleRemove(member.id, relation, name)
                          }
                          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
                        >
                          Entfernen
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </Shell>
  );
}

function Shell({ code, name, canManage = false, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-950">
              {code?.toUpperCase()}
            </span>
            <span className="truncate font-semibold">
              {name ?? 'Mannschaft'}
            </span>
            {canManage && (
              <span className="shrink-0 rounded-full border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300">
                Trainer:in
              </span>
            )}
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Zurück
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
