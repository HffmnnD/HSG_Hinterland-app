import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useTeams } from '../hooks/useTeams';
import { relationLabel, relationLabelPlural } from '../lib/participation';
import { roleLabel } from '../lib/roles';
import AppLayout from './AppLayout';

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
        <p className="text-sm text-ink-muted">Wird geladen …</p>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell code={code}>
        <div role="alert" className="alert alert-error">
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
        <div role="alert" className="alert alert-error mb-4">
          {error}
        </div>
      )}
      {notice && <div className="alert alert-success mb-4">{notice}</div>}

      {/* Offene Beitrittsanfragen – ganz oben, nur für Verwaltung */}
      {canManage && pendingMembers.length > 0 && (
        <section className="card-warn">
          <h2 className="flex items-center gap-2 section-title text-base">
            Offene Beitrittsanfragen
            <span className="badge badge-pending">{pendingMembers.length}</span>
          </h2>
          <ul className="list-panel mt-3">
            {pendingMembers.map((member) => {
              const name = `${member.firstName} ${member.lastName}`;
              return (
                <li
                  key={`pending-${member.id}-${member.relationType}`}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <span className="font-bold text-ink">{name}</span>
                    <span className="ml-2 text-ink-muted">
                      möchte als {relationLabel(member.relationType)} beitreten
                    </span>
                    {member.email && (
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
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
                      className="btn btn-primary btn-sm"
                    >
                      Bestätigen
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleReject(member.id, member.relationType, name)
                      }
                      className="btn btn-danger btn-sm"
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

      {/* Kennzahlen */}
      <div
        className={`grid gap-4 sm:grid-cols-3 ${
          canManage && pendingMembers.length > 0 ? 'mt-6' : ''
        }`}
      >
        {SECTIONS.map((relation) => (
          <div key={relation} className="card">
            <p className="eyebrow">{relationLabelPlural(relation)}</p>
            <p className="stat-value">{counts[relation]}</p>
          </div>
        ))}
      </div>

      {/* Verwaltung nur für Trainer:innen dieser Mannschaft / Admins */}
      {canManage && (
        <form onSubmit={handleAdd} className="card-accent mt-6">
          <h2 className="section-title text-base">Mitglied hinzufügen</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={addRelation}
              onChange={(e) => setAddRelation(e.target.value)}
              disabled={busy}
              aria-label="Rolle in der Mannschaft"
              className="field-control-sm sm:w-auto"
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
              className="field-control-sm min-w-0 flex-1"
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
              className="btn btn-primary btn-sm btn-block sm:w-auto"
            >
              Hinzufügen
            </button>
          </div>
          <p className="field-hint">
            Manuell hinzugefügte Mitglieder sind sofort bestätigt.
          </p>
        </form>
      )}

      {/* Kader (nur bestätigte Mitglieder) */}
      {SECTIONS.map((relation) => (
        <section key={relation} className="mt-6">
          <h2 className="eyebrow">{relationLabelPlural(relation)}</h2>

          {members[relation].length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              Noch niemand zugeordnet.
            </p>
          ) : (
            <ul className="list-panel mt-2">
              {members[relation].map((member) => {
                const name = `${member.firstName} ${member.lastName}`;
                return (
                  <li
                    key={`${relation}-${member.id}`}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">
                        {name}
                        <span className="tag ml-2 font-semibold">
                          {roleLabel(member.role)}
                        </span>
                      </p>
                      {member.email && (
                        <p className="truncate text-xs text-ink-muted">
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
                            className="field-control-sm"
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
                          onClick={() => handleRemove(member.id, relation, name)}
                          className="btn btn-danger btn-sm"
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
    <AppLayout
      width="max-w-4xl"
      header={
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="badge badge-trainer shrink-0">
            {code?.toUpperCase()}
          </span>
          <span className="header-title">{name ?? 'Mannschaft'}</span>
          {canManage && (
            <span className="badge badge-neutral shrink-0">Trainer:in</span>
          )}
        </div>
      }
    >
      {children}
    </AppLayout>
  );
}
