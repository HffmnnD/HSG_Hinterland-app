import { useState } from 'react';

import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    // Kein setState mehr nötig: Komponente wird nach dem Logout unmounted.
  };

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    .toUpperCase()
    .trim();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-slate-950">
              H
            </div>
            <span className="font-semibold">HSG Hinterland</span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loggingOut ? 'Abmelden …' : 'Abmelden'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-lg font-bold text-emerald-400">
            {initials || '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              Willkommen, {user.firstName}!
            </h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-300">Kontostatus</h2>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  user.isApproved ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {user.isApproved
                ? 'Freigeschaltet'
                : 'Warten auf Admin-Freigabe'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-300">
              Mitglied seit
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('de-DE')
                : '—'}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center">
          <p className="text-sm text-slate-400">
            Dies ist eine geschützte Dummy-Ansicht. Hier entstehen als Nächstes
            Kalender, Dienstplanung und das Schwarze Brett.
          </p>
        </div>
      </main>
    </div>
  );
}
