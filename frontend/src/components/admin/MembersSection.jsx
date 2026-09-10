import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleSlash, RotateCcw, SearchX, ShieldCheck, UserCheck, Users } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTeams } from '../../hooks/useTeams';
import { useAdminUsers, useMemberStats } from '../../hooks/useAdminUsers';
import { ADMIN_ROLES, ROLES, roleLabel } from '../../lib/roles';
import { relationLabelPlural, serviceLabel } from '../../lib/participation';
import { formatCount, formatNumber } from '../../lib/format';
import TeamSelect from '../TeamSelect';
import StatCard from './ui/StatCard';
import SearchField from './ui/SearchField';
import Pagination from './ui/Pagination';
import { EmptyState, ErrorNote, Loading } from './ui/Feedback';

// Wie viele Zeilen eine Seite zeigt. 20 füllen einen Bildschirm, ohne dass
// das Blättern zur Fleißarbeit wird.
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'Status: alle' },
  { value: 'active', label: 'Nur aktive' },
  { value: 'inactive', label: 'Nur gesperrte' },
];

/**
 * Mitgliederverwaltung: Kennzahlen, Suche, Filter, Tabelle, Seitenschaltung.
 *
 * Suche und Filter laufen im Backend (siehe hooks/useAdminUsers.js) – die
 * Tabelle bekommt immer nur die eine Seite, die sie anzeigt. Damit bleibt die
 * Seite auch bei mehreren tausend Konten so schnell wie bei zwanzig.
 */
export default function MembersSection() {
  const { user: currentUser } = useAuth();
  const { teams: allTeams } = useTeams();

  const actorRole = currentUser?.role;
  // admin & sub_admin dürfen Rolle und Freigabe ändern, Trainer:innen nicht.
  const canManageAccounts = ADMIN_ROLES.includes(actorRole);
  const isSubAdmin = actorRole === 'sub_admin';

  const [search, setSearchValue] = useState('');
  const [role, setRoleValue] = useState('');
  const [status, setStatusValue] = useState('');
  const [page, setPage] = useState(1);

  // Jede Änderung an Suche oder Filter springt zurück auf Seite 1. Sonst
  // landet man z. B. auf Seite 7 einer Ergebnisliste, die nur noch drei
  // Seiten hat – die Tabelle wäre leer, obwohl es Treffer gibt.
  const setSearch = (value) => {
    setSearchValue(value);
    setPage(1);
  };
  const setRole = (value) => {
    setRoleValue(value);
    setPage(1);
  };
  const setStatus = (value) => {
    setStatusValue(value);
    setPage(1);
  };

  // Zählt hoch, sobald eine Änderung gespeichert wurde -> die Kennzahlen im
  // Kopf laden neu (eine Sperrung verschiebt aktiv/gesperrt).
  const [statsKey, setStatsKey] = useState(0);

  const {
    users,
    total,
    pageCount,
    loading,
    error,
    setError,
    setUsers,
    reload,
  } = useAdminUsers({ search, role, status, page, pageSize: PAGE_SIZE });

  const { stats } = useMemberStats(statsKey);

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

  /** Gemeinsame PATCH-Logik mit optimistischem Update und Rollback. */
  const patchUser = async (id, body, optimistic) => {
    const previous = users;
    setSaving(id, true);
    setError(null);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...optimistic } : u)));

    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setStatsKey((key) => key + 1);
    } catch (err) {
      setUsers(previous);
      setError(err.message);
      reload();
    } finally {
      setSaving(id, false);
    }
  };

  const changeRole = (id, nextRole) => patchUser(id, { role: nextRole }, { role: nextRole });
  const setApproved = (id, isApproved) => patchUser(id, { isApproved }, { isApproved });

  // Die Chips steuern die Spieler-Zuordnung; Trainer-/Fan-Beziehungen werden
  // auf der Mannschaftsseite gepflegt und bleiben hier unverändert.
  const togglePlayerTeam = (userId, teamId) => {
    const target = users.find((u) => u.id === userId);
    const teams = target?.teams ?? [];
    const playerIds = teams.filter((t) => t.relationType === 'player').map((t) => t.id);
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

  // Sub-Admins dürfen die Rolle „Admin" nicht vergeben.
  const assignableRoles = isSubAdmin ? ROLES.filter((r) => r !== 'admin') : ROLES;

  const hasFilters = Boolean(search.trim() || role || status);

  const resetFilters = () => {
    setSearchValue('');
    setRoleValue('');
    setStatusValue('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Kennzahlen des gesamten Vereins – unabhängig von den Filtern. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Mitglieder"
          value={formatNumber(stats?.total ?? total)}
          hint={`${formatNumber(stats?.recent ?? 0)} in den letzten 30 Tagen dazugekommen`}
        />
        <StatCard
          icon={UserCheck}
          label="Aktiv"
          value={formatNumber(stats?.active ?? 0)}
          hint="Konten ohne Admin-Sperre"
        />
        <StatCard
          icon={CircleSlash}
          label="Gesperrt"
          value={formatNumber(stats?.inactive ?? 0)}
          hint={
            stats?.inactive > 0
              ? 'Kein Login möglich, bis reaktiviert'
              : 'Kein Konto gesperrt'
          }
        />
        <StatCard
          icon={ShieldCheck}
          label="Verwaltung"
          value={formatNumber(countRoles(stats, ['admin', 'sub_admin', 'trainer']))}
          hint="Admins, Sub-Admins und Trainer:innen"
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="admin-card">
        <div className="admin-card__header">
          <div className="min-w-0">
            <h2 className="section-title text-base">Mitglieder</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {canManageAccounts
                ? 'Rollen, Sperren und Mannschaftszuordnungen verwalten.'
                : 'Mannschaftszuordnung der Mitglieder verwalten.'}
            </p>
          </div>
          <span className="badge badge-neutral">
            {formatCount(total, 'Treffer', 'Treffer')}
          </span>
        </div>

        {/* Werkzeugleiste: Suche + zwei Dropdown-Filter */}
        <div className="admin-toolbar">
          <SearchField
            id="member-search"
            label="Mitglieder durchsuchen"
            value={search}
            onChange={setSearch}
            placeholder="Name, E-Mail oder Mitgliedsnummer …"
          />

          <div className="flex shrink-0 gap-2">
            <label htmlFor="member-role" className="sr-only">
              Nach Rolle filtern
            </label>
            <select
              id="member-role"
              className="field-control-sm"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="">Rolle: alle</option>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>

            <label htmlFor="member-status" className="sr-only">
              Nach Status filtern
            </label>
            <select
              id="member-status"
              className="field-control-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="pagination__btn"
                title="Suche und Filter zurücksetzen"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Zurücksetzen</span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Loading>Mitglieder werden geladen …</Loading>
        ) : users.length === 0 ? (
          <EmptyState
            icon={hasFilters ? SearchX : Users}
            title={hasFilters ? 'Keine Treffer' : 'Noch keine Mitglieder'}
            hint={
              hasFilters
                ? 'Für diese Suche und Filter gibt es kein Mitglied. Andere Schreibweise probieren oder Filter zurücksetzen.'
                : 'Sobald sich jemand registriert, erscheint das Konto hier.'
            }
          >
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="btn btn-outline btn-sm mt-2">
                Filter zurücksetzen
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <table className="data-table min-w-[1120px]">
                <thead>
                  <tr>
                    <th>Nr.</th>
                    <th>Name</th>
                    <th>E-Mail</th>
                    <th>Rolle</th>
                    <th>Mannschaften (Spieler)</th>
                    <th>Weitere</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <MemberRow
                      key={u.id}
                      user={u}
                      allTeams={allTeams}
                      isSelf={u.id === currentUser?.id}
                      busy={savingIds.has(u.id)}
                      locked={isLockedRow(u)}
                      canManageAccounts={canManageAccounts}
                      assignableRoles={assignableRoles}
                      onChangeRole={changeRole}
                      onSetApproved={setApproved}
                      onToggleTeam={togglePlayerTeam}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
              unit="Mitgliedern"
            />
          </>
        )}
      </section>
    </div>
  );
}

/** Summe mehrerer Rollen aus den Kennzahlen. */
function countRoles(stats, roles) {
  if (!stats?.byRole) return 0;
  return stats.byRole
    .filter((entry) => roles.includes(entry.role))
    .reduce((sum, entry) => sum + entry.count, 0);
}

/**
 * Eine Tabellenzeile. Eigene Komponente, damit die Tabelle lesbar bleibt –
 * und damit React beim Tippen in der Suche nur die Zeilen neu zeichnet, die
 * sich tatsächlich geändert haben.
 */
function MemberRow({
  user,
  allTeams,
  isSelf,
  busy,
  locked,
  canManageAccounts,
  assignableRoles,
  onChangeRole,
  onSetApproved,
  onToggleTeam,
}) {
  const teams = user.teams ?? [];
  const playerTeamIds = teams.filter((t) => t.relationType === 'player').map((t) => t.id);
  const otherRelations = ['coach', 'fan']
    .map((relation) => ({
      relation,
      entries: teams.filter((t) => t.relationType === relation),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <tr>
      {/* Die Mitgliedsnummer ist die Konto-ID – sie ist eindeutig, ändert sich
          nie und ist genau das, wonach in der Suche gesucht werden kann. */}
      <td className="tabular-nums text-ink-muted">{user.id}</td>

      <td className="whitespace-nowrap">
        <span className="font-bold text-ink">
          {user.firstName} {user.lastName}
        </span>
        {isSelf && <span className="ml-2 text-xs text-ink-muted">(du)</span>}
        {locked && (
          <span
            className="badge badge-neutral ml-2"
            title="Admin-Konten sind für Sub-Admins gesperrt."
          >
            gesperrt
          </span>
        )}
      </td>

      <td className="whitespace-nowrap text-ink-muted">{user.email}</td>

      <td>
        {canManageAccounts ? (
          <select
            value={user.role}
            disabled={busy || isSelf || locked}
            onChange={(event) => onChangeRole(user.id, event.target.value)}
            className="field-control-sm"
            aria-label={`Rolle von ${user.firstName} ${user.lastName}`}
            title={
              locked
                ? 'Sub-Admins dürfen Admin-Konten nicht bearbeiten.'
                : isSelf
                  ? 'Die eigene Rolle kann hier nicht geändert werden.'
                  : undefined
            }
          >
            {/* Aktuelle Rolle immer anzeigen, auch wenn sie nicht vergeben
                werden darf. */}
            {(assignableRoles.includes(user.role)
              ? assignableRoles
              : [user.role, ...assignableRoles]
            ).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-ink-soft">{roleLabel(user.role)}</span>
        )}
      </td>

      <td className="min-w-[18rem]">
        <TeamSelect
          teams={allTeams}
          selectedIds={playerTeamIds}
          onToggle={(teamId) => onToggleTeam(user.id, teamId)}
          disabled={busy || locked}
          size="sm"
        />
      </td>

      <td>
        {otherRelations.length === 0 && user.services.length === 0 ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <div className="space-y-1.5">
            {otherRelations.map(({ relation, entries }) => (
              <div key={relation} className="text-xs">
                <span className="text-ink-muted">{relationLabelPlural(relation)}: </span>
                {entries.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ', '}
                    <Link to={`/teams/${t.code}`} className="link" title={t.name}>
                      {t.code}
                    </Link>
                  </span>
                ))}
              </div>
            ))}
            {user.services.length > 0 && (
              <div className="text-xs text-ink-muted">
                Dienste:{' '}
                <span className="text-ink-soft">
                  {user.services.map(serviceLabel).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </td>

      <td>
        {user.isApproved ? (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="status text-hsg-green-dark">
              <span className="status-dot bg-hsg-green" />
              Aktiv
            </span>
            {/* Sperren ist die Gegenrichtung zum Reaktivieren – ohne sie
                führt der Weg nur in eine Richtung. Das eigene Konto und
                Admin-Konten (für Sub-Admins) bleiben ausgenommen. */}
            {canManageAccounts && !locked && !isSelf && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetApproved(user.id, false)}
                className="btn btn-danger btn-sm"
                title="Konto sperren – ein Login ist danach nicht mehr möglich."
              >
                {busy ? '…' : 'Sperren'}
              </button>
            )}
          </div>
        ) : canManageAccounts && !locked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSetApproved(user.id, true)}
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
}
