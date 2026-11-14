import { useState } from 'react';
import { ChevronRight, RotateCcw, SearchX, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useTeams } from '../../hooks/useTeams';
import { useAccess } from '../../hooks/useAccess';
import { useAdminUsers, useMemberStats } from '../../hooks/useAdminUsers';
import { roleLabel } from '../../lib/roles';
import { formatCount, formatNumber } from '../../lib/format';
import Avatar from '../ui/Avatar';
import StatCard from '../ui/StatCard';
import SearchField from './ui/SearchField';
import Pagination from './ui/Pagination';
import { EmptyState, ErrorNote, Loading } from './ui/Feedback';
import MemberDialog from './MemberDialog';

// 25 Einträge füllen am Handy gut zwei Bildschirme, am Desktop einen.
const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: '', label: 'Alle Konten' },
  { value: 'active', label: 'Nur aktive' },
  { value: 'inactive', label: 'Nur gesperrte' },
];

/**
 * Mitgliederverwaltung für große Vereine (1000+ Konten, viele davon reine
 * Zuschauer:innen).
 *
 *   – Suche und Filter laufen im Backend, die Liste bekommt nur die eine Seite,
 *     die sie zeigt.
 *   – Eine Zeile je Person, am Handy wie am Desktop lesbar (keine breite
 *     Tabelle mit Querscrollen). Bearbeitet wird im Detaildialog.
 */
export default function MembersSection() {
  const { user: currentUser } = useAuth();
  const { teams: allTeams } = useTeams();
  const { roles } = useAccess();

  const [search, setSearchValue] = useState('');
  const [role, setRoleValue] = useState('');
  const [status, setStatusValue] = useState('');
  const [teamId, setTeamValue] = useState('');
  const [teamless, setTeamlessValue] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [statsKey, setStatsKey] = useState(0);

  // Jede Änderung an Suche oder Filter springt zurück auf Seite 1.
  const withReset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  const setSearch = withReset(setSearchValue);
  const setRole = withReset(setRoleValue);
  const setStatus = withReset(setStatusValue);
  const setTeam = withReset(setTeamValue);
  const setTeamless = withReset(setTeamlessValue);

  const { users, total, pageCount, loading, error, reload } = useAdminUsers({
    search,
    role,
    status,
    teamId,
    teamless,
    page,
    pageSize: PAGE_SIZE,
  });
  const { stats } = useMemberStats(statsKey);

  const hasFilters = Boolean(search.trim() || role || status || teamId || teamless);
  const resetFilters = () => {
    setSearchValue('');
    setRoleValue('');
    setStatusValue('');
    setTeamValue('');
    setTeamlessValue(false);
    setPage(1);
  };

  const openUser = users.find((u) => u.id === openId) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="Mitglieder" value={formatNumber(stats?.total ?? total)} />
        <StatCard icon={UserPlus} label="Neu (30 Tage)" value={formatNumber(stats?.recent ?? 0)} />
        <StatCard
          icon={ShieldCheck}
          label="Verwaltung & Trainer"
          value={formatNumber(countRoles(stats, ['admin', 'sub_admin', 'trainer']))}
        />
        <StatCard icon={UserX} label="Gesperrt" value={formatNumber(stats?.inactive ?? 0)} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="panel">
        <div className="panel__header">
          <h2 className="section-title text-base">Mitglieder</h2>
          <span className="badge badge-neutral">{formatCount(total, 'Treffer', 'Treffer')}</span>
        </div>

        <div className="space-y-2 border-b border-line bg-surface/70 px-4 py-3 sm:px-5">
          <SearchField
            id="member-search"
            label="Mitglieder durchsuchen"
            value={search}
            onChange={setSearch}
            placeholder="Name, E-Mail oder Mitgliedsnummer …"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect id="member-role" label="Nach Rolle filtern" value={role} onChange={setRole}>
              <option value="">Alle Rollen</option>
              {roles.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="member-team" label="Nach Mannschaft filtern" value={teamId} onChange={setTeam}>
              <option value="">Alle Mannschaften</option>
              {allTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="member-status" label="Nach Status filtern" value={status} onChange={setStatus}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
            <button
              type="button"
              role="switch"
              aria-checked={teamless}
              onClick={() => setTeamless(!teamless)}
              className={`chip chip-sm ${teamless ? 'chip-active' : ''}`}
              title="Nur Personen ohne Spieler- oder Trainerzuordnung, z. B. Zuschauer:innen"
            >
              Ohne Mannschaft
            </button>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="pagination__btn col-span-2 sm:col-span-1">
                <RotateCcw size={14} aria-hidden="true" />
                Zurücksetzen
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Loading>Mitglieder werden geladen …</Loading>
        ) : users.length === 0 ? (
          <EmptyState icon={hasFilters ? SearchX : Users} title={hasFilters ? 'Keine Treffer' : 'Noch keine Mitglieder'}>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="btn btn-outline btn-sm mt-2">
                Filter zurücksetzen
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {users.map((member) => (
                <li key={member.id}>
                  <MemberRow
                    member={member}
                    roles={roles}
                    isSelf={member.id === currentUser?.id}
                    onOpen={() => setOpenId(member.id)}
                  />
                </li>
              ))}
            </ul>
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

      {openUser && (
        <MemberDialog
          key={openUser.id}
          member={openUser}
          roles={roles}
          allTeams={allTeams}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            reload();
            setStatsKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({ id, label, value, onChange, children }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className="field-control-sm w-full sm:w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </>
  );
}

function countRoles(stats, roleKeys) {
  if (!stats?.byRole) return 0;
  return stats.byRole.filter((entry) => roleKeys.includes(entry.role)).reduce((sum, entry) => sum + entry.count, 0);
}

/** Eine Person in der Liste: Bild, Name, Rollen, Mannschaften, Status. */
function MemberRow({ member, roles, isSelf, onOpen }) {
  const squad = (member.teams ?? []).filter((t) => t.relationType !== 'fan');
  const extra = member.extraRoles ?? [];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface sm:px-5"
    >
      <Avatar person={member} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-bold text-ink">
            {member.firstName} {member.lastName}
          </span>
          {isSelf && <span className="text-xs text-ink-muted">(du)</span>}
          {!member.isApproved && <span className="badge badge-declined">Gesperrt</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <span className="tabular-nums">#{member.id}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-ink-soft">{roleLabel(member.role, roles)}</span>
          {extra.map((key) => (
            <span key={key} className="tag text-[0.65rem]">
              {roleLabel(key, roles)}
            </span>
          ))}
          {squad.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {squad.map((t) => `${t.code}${t.relationType === 'coach' ? ' (T)' : ''}`).join(', ')}
              </span>
            </>
          )}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
    </button>
  );
}
