import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { MANAGEMENT_ROLES, roleBadge, roleLabel } from '../lib/roles';
import { relationLabelPlural, serviceLabel } from '../lib/participation';

const RELATION_ORDER = ['coach', 'player', 'fan'];

export default function Dashboard() {
  const { user, role, teams, services, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    // Kein setState mehr nötig: Komponente wird nach dem Logout unmounted.
  };

  // Normalerweise garantiert ProtectedRoute einen Nutzer. Der Guard verhindert
  // einen Absturz, falls die Sitzung während des Renderns wegfällt.
  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    .toUpperCase()
    .trim();

  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';
  const canManageMembers = MANAGEMENT_ROLES.includes(role);
  const badge = roleBadge(role);

  // Mannschaften nach Beziehungstyp gruppieren.
  const teamsByRelation = RELATION_ORDER.map((relation) => ({
    relation,
    entries: teams.filter((team) => team.relationType === relation),
  })).filter((group) => group.entries.length > 0);

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

          <div className="flex items-center gap-2">
            {canManageMembers && (
              <Link
                to="/admin"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                Mitglieder
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loggingOut ? 'Abmelden …' : 'Abmelden'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-lg font-bold text-emerald-400">
            {initials || '?'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">Willkommen, {user.firstName}!</h1>
              {badge && (
                <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-950">
                  {badge}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span className="truncate">{user.email}</span>
              <span
                className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-emerald-300"
                title="Deine Rolle"
              >
                {roleLabel(role)}
              </span>
            </div>
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
              {user.isApproved ? 'Freigeschaltet' : 'Warten auf Admin-Freigabe'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-300">Mitglied seit</h2>
            <p className="mt-2 text-sm text-slate-400">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('de-DE')
                : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-slate-300">
            Meine Mannschaften
          </h2>
          {teamsByRelation.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              Noch keiner Mannschaft zugeordnet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {teamsByRelation.map(({ relation, entries }) => (
                <div key={relation}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {relationLabelPlural(relation)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {entries.map((team) => (
                      <Link
                        key={`${relation}-${team.id}`}
                        to={`/teams/${team.code}`}
                        title={team.name}
                        className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-emerald-500 hover:text-emerald-300"
                      >
                        {team.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {services.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-300">
              Meine Helferdienste
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {services.map((service) => (
                <span
                  key={service}
                  className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-200"
                >
                  {serviceLabel(service)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Verwaltung: Admins, Sub-Admins und Trainer:innen */}
        {canManageMembers && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <div className="flex items-center gap-2">
              {badge && (
                <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-xs font-bold text-slate-950">
                  {badge}
                </span>
              )}
              <h2 className="text-sm font-semibold text-emerald-200">
                {isAdmin || isSubAdmin
                  ? 'Administration'
                  : 'Mannschaftsverwaltung'}
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {isAdmin &&
                'Verwalte Mitglieder, Freigaben, Rollen und Mannschaften.'}
              {isSubAdmin &&
                'Verwalte Mitglieder, Freigaben und Mannschaften. Admin-Konten sind für dich gesperrt.'}
              {!isAdmin &&
                !isSubAdmin &&
                'Ändere die Mannschaftszuordnung der Mitglieder.'}
            </p>
            <Link
              to="/admin"
              className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Zur Mitgliederverwaltung
            </Link>
          </div>
        )}

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
