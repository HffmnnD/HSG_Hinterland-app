import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ROLES, roleLabel } from '../lib/roles';

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  // Für manuelles Neuladen (z. B. nach einem Fehler beim Speichern).
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initiales Laden – setState erst nach dem await, um Kaskaden-Renders zu vermeiden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/admin/users');
        if (!cancelled) setUsers(data.users);
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

  const patchUser = async (id, changes) => {
    setSavingId(id);
    setError(null);
    // Optimistisch aktualisieren.
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...changes } : u))
    );
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
    } catch (err) {
      setError(err.message);
      loadUsers(); // Serverstand wiederherstellen
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-950">
              ADMIN
            </span>
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

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-xl font-bold">Mitglieder</h1>
        <p className="mt-1 text-sm text-slate-400">
          Freigaben erteilen und Rollen zuweisen.
        </p>

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
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">E-Mail</th>
                  <th className="px-4 py-3 font-medium">Rolle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const busy = savingId === u.id;
                  return (
                    <tr key={u.id} className="align-middle">
                      <td className="px-4 py-3">
                        {u.firstName} {u.lastName}
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-500">(du)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={busy || isSelf}
                          onChange={(e) =>
                            patchUser(u.id, { role: e.target.value })
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
                          title={
                            isSelf
                              ? 'Die eigene Rolle kann hier nicht geändert werden.'
                              : undefined
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {u.isApproved ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            Freigeschaltet
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              patchUser(u.id, { isApproved: true })
                            }
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {busy ? '…' : 'Freischalten'}
                          </button>
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
