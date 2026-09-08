import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { ADMIN_ROLES, ROLES, roleBadge, roleLabel } from '../lib/roles';
import { relationLabelPlural, serviceLabel } from '../lib/participation';
import TeamSelect from './TeamSelect';

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { teams: allTeams } = useTeams();

  const actorRole = currentUser?.role;
  // admin & sub_admin dürfen Rolle und Freigabe ändern, Trainer:innen nicht.
  const canManageAccounts = ADMIN_ROLES.includes(actorRole);
  const isSubAdmin = actorRole === 'sub_admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Mehrere Zeilen können gleichzeitig gespeichert werden.
  const [savingIds, setSavingIds] = useState(() => new Set());

  const setSaving = useCallback((id, isSaving) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (isSaving) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Serverstand nachladen, OHNE eine bestehende Fehlermeldung zu überschreiben.
  const reloadUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data?.users ?? []);
    } catch {
      // Die ursprüngliche Fehlermeldung bleibt stehen.
    }
  }, []);

  // Initiales Laden – setState erst nach dem await, um Kaskaden-Renders zu vermeiden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/admin/users');
        if (!cancelled) setUsers(data?.users ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Gemeinsame PATCH-Logik mit optimistischem Update und Rollback.
  const patchUser = async (id, body, optimistic) => {
    const previous = users;
    setSaving(id, true);
    setError(null);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...optimistic } : u))
    );
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } catch (err) {
      setUsers(previous);
      setError(err.message);
      reloadUsers();
    } finally {
      setSaving(id, false);
    }
  };

  const changeRole = (id, role) => patchUser(id, { role }, { role });
  const approve = (id) =>
    patchUser(id, { isApproved: true }, { isApproved: true });

  // Die Chips steuern die Spieler-Zuordnung; Trainer-/Fan-Beziehungen werden
  // auf der Mannschaftsseite gepflegt und bleiben hier unverändert.
  const togglePlayerTeam = (userId, teamId) => {
    const target = users.find((u) => u.id === userId);
    const teams = target?.teams ?? [];
    const playerIds = teams
      .filter((t) => t.relationType === 'player')
      .map((t) => t.id);
    const nextIds = playerIds.includes(teamId)
      ? playerIds.filter((x) => x !== teamId)
      : [...playerIds, teamId];

    const nextTeams = [
      ...teams.filter((t) => t.relationType !== 'player'),
      ...nextIds
        .map((tid) => allTeams.find((t) => t.id === tid))
        .filter(Boolean)
        .map((t) => ({ ...t, relationType: 'player' })),
    ];

    patchUser(userId, { teamIds: nextIds }, { teams: nextTeams });
  };

  // Sub-Admins dürfen Admin-Konten nicht bearbeiten (das Backend blockt es
  // ebenfalls – hier nur, damit die UI es gar nicht erst anbietet).
  const isLockedRow = (user) => isSubAdmin && user.role === 'admin';

  // Sub-Admins dürfen die Rolle „Admin“ nicht vergeben.
  const assignableRoles = isSubAdmin
    ? ROLES.filter((r) => r !== 'admin')
    : ROLES;

  const badge = roleBadge(actorRole);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {badge && (
              <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-950">
                {badge}
              </span>
            )}
            <span className="font-semibold">Mitgliederverwaltung</span>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Zurück
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-xl font-bold">Mitglieder</h1>
        <p className="mt-1 text-sm text-slate-400">
          {canManageAccounts
            ? 'Rollen und Mannschaftszuordnungen verwalten.'
            : 'Mannschaftszuordnung der Mitglieder verwalten.'}
        </p>
        {isSubAdmin && (
          <p className="mt-1 text-sm text-amber-300/80">
            Als Sub-Admin kannst du Admin-Konten nicht bearbeiten und die Rolle
            „Admin“ nicht vergeben.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Wird geladen …</p>
        ) : users.length === 0 ? (
          <p className="mt-6 text-sm text-slate-400">Keine Mitglieder gefunden.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">E-Mail</th>
                  <th className="px-4 py-3 font-medium">Rolle</th>
                  <th className="px-4 py-3 font-medium">Mannschaften (Spieler)</th>
                  <th className="px-4 py-3 font-medium">Weitere</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const busy = savingIds.has(u.id);
                  const locked = isLockedRow(u);
                  const teams = u.teams ?? [];
                  const playerTeamIds = teams
                    .filter((t) => t.relationType === 'player')
                    .map((t) => t.id);
                  const otherRelations = ['coach', 'fan']
                    .map((relation) => ({
                      relation,
                      entries: teams.filter((t) => t.relationType === relation),
                    }))
                    .filter((group) => group.entries.length > 0);

                  return (
                    <tr
                      key={u.id}
                      className={`align-top ${locked ? 'bg-slate-900/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        {u.firstName} {u.lastName}
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-500">(du)</span>
                        )}
                        {locked && (
                          <span
                            className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-amber-300/80"
                            title="Admin-Konten sind für Sub-Admins gesperrt."
                          >
                            gesperrt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{u.email}</td>

                      <td className="px-4 py-3">
                        {canManageAccounts ? (
                          <select
                            value={u.role}
                            disabled={busy || isSelf || locked}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
                            title={
                              locked
                                ? 'Sub-Admins dürfen Admin-Konten nicht bearbeiten.'
                                : isSelf
                                  ? 'Die eigene Rolle kann hier nicht geändert werden.'
                                  : undefined
                            }
                          >
                            {/* Aktuelle Rolle immer anzeigen, auch wenn sie
                                nicht vergeben werden darf. */}
                            {(assignableRoles.includes(u.role)
                              ? assignableRoles
                              : [u.role, ...assignableRoles]
                            ).map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300">
                            {roleLabel(u.role)}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <TeamSelect
                          teams={allTeams}
                          selectedIds={playerTeamIds}
                          onToggle={(teamId) => togglePlayerTeam(u.id, teamId)}
                          disabled={busy || locked}
                          size="sm"
                        />
                      </td>

                      <td className="px-4 py-3">
                        {otherRelations.length === 0 && u.services.length === 0 ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {otherRelations.map(({ relation, entries }) => (
                              <div key={relation}>
                                <span className="text-xs text-slate-500">
                                  {relationLabelPlural(relation)}:{' '}
                                </span>
                                {entries.map((t, i) => (
                                  <span key={t.id} className="text-xs">
                                    {i > 0 && ', '}
                                    <Link
                                      to={`/teams/${t.code}`}
                                      className="text-slate-300 hover:text-emerald-300"
                                      title={t.name}
                                    >
                                      {t.code}
                                    </Link>
                                  </span>
                                ))}
                              </div>
                            ))}
                            {u.services.length > 0 && (
                              <div className="text-xs text-slate-500">
                                Dienste:{' '}
                                <span className="text-slate-300">
                                  {u.services.map(serviceLabel).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {u.isApproved ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            Aktiv
                          </span>
                        ) : canManageAccounts && !locked ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approve(u.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {busy ? '…' : 'Reaktivieren'}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-300">
                            <span className="h-2 w-2 rounded-full bg-amber-400" />
                            Gesperrt
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
