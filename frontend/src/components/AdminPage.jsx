import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { ADMIN_ROLES, ROLES, roleLabel } from '../lib/roles';
import { relationLabelPlural, serviceLabel } from '../lib/participation';
import TeamSelect from './TeamSelect';
import AppLayout from './AppLayout';
import NewsManager from './NewsManager';
import { RoleBadge } from './Badge';

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

  return (
    <AppLayout width="max-w-6xl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title">Verwaltung</h1>
        <RoleBadge role={actorRole} />
      </div>
      {isSubAdmin && (
        <div className="alert alert-info mt-3">
          Als Sub-Admin kannst du Admin-Konten nicht bearbeiten und die Rolle
          „Admin“ nicht vergeben.
        </div>
      )}

      <section className="mt-6">
        <h2 className="section-title">Mitglieder</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {canManageAccounts
            ? 'Rollen und Mannschaftszuordnungen verwalten.'
            : 'Mannschaftszuordnung der Mitglieder verwalten.'}
        </p>

        {error && (
          <div role="alert" className="alert alert-error mt-4">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-ink-muted">Wird geladen …</p>
        ) : users.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Keine Mitglieder gefunden.
          </p>
        ) : (
          <div className="table-wrap mt-4">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Rolle</th>
                  <th>Mannschaften (Spieler)</th>
                  <th>Weitere</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={u.id}>
                      <td>
                        <span className="font-bold text-ink">
                          {u.firstName} {u.lastName}
                        </span>
                        {isSelf && (
                          <span className="ml-2 text-xs text-ink-muted">
                            (du)
                          </span>
                        )}
                        {locked && (
                          <span
                            className="badge badge-neutral ml-2"
                            title="Admin-Konten sind für Sub-Admins gesperrt."
                          >
                            gesperrt
                          </span>
                        )}
                      </td>
                      <td className="text-ink-muted">{u.email}</td>

                      <td>
                        {canManageAccounts ? (
                          <select
                            value={u.role}
                            disabled={busy || isSelf || locked}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            className="field-control-sm"
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
                          <span className="text-ink-soft">
                            {roleLabel(u.role)}
                          </span>
                        )}
                      </td>

                      <td>
                        <TeamSelect
                          teams={allTeams}
                          selectedIds={playerTeamIds}
                          onToggle={(teamId) => togglePlayerTeam(u.id, teamId)}
                          disabled={busy || locked}
                          size="sm"
                        />
                      </td>

                      <td>
                        {otherRelations.length === 0 &&
                        u.services.length === 0 ? (
                          <span className="text-xs text-ink-muted">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {otherRelations.map(({ relation, entries }) => (
                              <div key={relation} className="text-xs">
                                <span className="text-ink-muted">
                                  {relationLabelPlural(relation)}:{' '}
                                </span>
                                {entries.map((t, i) => (
                                  <span key={t.id}>
                                    {i > 0 && ', '}
                                    <Link
                                      to={`/teams/${t.code}`}
                                      className="link"
                                      title={t.name}
                                    >
                                      {t.code}
                                    </Link>
                                  </span>
                                ))}
                              </div>
                            ))}
                            {u.services.length > 0 && (
                              <div className="text-xs text-ink-muted">
                                Dienste:{' '}
                                <span className="text-ink-soft">
                                  {u.services.map(serviceLabel).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td>
                        {u.isApproved ? (
                          <span className="status text-hsg-green-dark">
                            <span className="status-dot bg-hsg-green" />
                            Aktiv
                          </span>
                        ) : canManageAccounts && !locked ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approve(u.id)}
                            className="btn btn-primary btn-sm"
                          >
                            {busy ? '…' : 'Reaktivieren'}
                          </button>
                        ) : (
                          <span className="status text-warn">
                            <span className="status-dot bg-warn" />
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
      </section>

      {/* Vereins-News – Trainer:innen dürfen keine Beiträge veröffentlichen
          (das Backend lehnt sie ohnehin ab). */}
      {canManageAccounts && <NewsManager />}
    </AppLayout>
  );
}
