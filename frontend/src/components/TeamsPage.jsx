import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Star } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { apiFetch } from '../lib/api';
import { relationLabel } from '../lib/participation';
import { groupTeams, teamMeta } from '../lib/teams';
import AppLayout from './AppLayout';
import SearchField from './admin/ui/SearchField';

/**
 * Reiter „Teams": alle Mannschaften auf einer Seite.
 *
 *   1. Favoriten   – mit dem Stern markiert, persönliche Auswahl
 *   2. Meine Teams – wo ich spiele, trainiere oder Fan bin (ohne Favoriten)
 *   3. Weitere     – alle übrigen, nach Senioren und Jugend gruppiert
 *
 * Jede Mannschaft erscheint genau einmal.
 *
 * Der Stern ist eine reine Ansichts-Einstellung (kein Beitritt): Er hebt eine
 * Mannschaft hervor, z. B. die des Kindes oder die erste Herren.
 */
export default function TeamsPage() {
  const { user, refreshProfile } = useAuth();
  const { teams: allTeams, loading, error } = useTeams();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState(null);

  const favorites = useMemo(() => new Set(favoriteIds ?? user?.favoriteTeamIds ?? []), [favoriteIds, user]);
  const relations = useMemo(() => {
    const map = new Map();
    for (const team of user?.teams ?? []) {
      if (!map.has(team.id)) map.set(team.id, []);
      map.get(team.id).push(team);
    }
    return map;
  }, [user]);

  const toggleFavorite = async (team) => {
    const on = !favorites.has(team.id);
    setPending((prev) => new Set(prev).add(team.id));
    setFavoriteIds([...favorites].filter((id) => id !== team.id).concat(on ? [team.id] : []));
    try {
      const result = await apiFetch(`/api/me/favorites/${team.id}`, { method: on ? 'PUT' : 'DELETE' });
      setFavoriteIds(result.favoriteTeamIds);
      refreshProfile();
    } catch {
      setFavoriteIds(null);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(team.id);
        return next;
      });
    }
  };

  const term = search.trim().toLowerCase();
  const matches = (team) =>
    !term || `${team.name} ${team.code} ${team.ageGroup ?? ''}`.toLowerCase().includes(term);

  const favoriteTeams = allTeams.filter((t) => favorites.has(t.id) && matches(t));
  // Jede Mannschaft steht nur EINMAL: Favoriten zuerst, dann eigene
  // Mannschaften, im Rest nur, was oben noch nicht vorkam.
  const myTeams = allTeams.filter((t) => relations.has(t.id) && !favorites.has(t.id) && matches(t));
  const filtered = allTeams.filter(matches);
  const others = filtered.filter((t) => !favorites.has(t.id) && !relations.has(t.id));

  const card = (team) => (
    <TeamCard
      key={team.id}
      team={team}
      relations={relations.get(team.id) ?? []}
      favorite={favorites.has(team.id)}
      busy={pending.has(team.id)}
      onToggleFavorite={() => toggleFavorite(team)}
    />
  );

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Teams</h1>

      <div className="mt-4">
        <SearchField id="team-search" label="Mannschaft suchen" value={search} onChange={setSearch} placeholder="Mannschaft suchen …" />
      </div>

      {error && (
        <div role="alert" className="alert alert-error mt-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => (
            <span key={row} className="skeleton h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Section title="Favoriten" icon={<Star size={15} className="text-warn" aria-hidden="true" />}>
            {favoriteTeams.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">{favoriteTeams.map(card)}</ul>
            ) : (
              <p className="text-sm text-ink-muted">
                Tippe bei einer Mannschaft auf den Stern, um sie hier oben zu sammeln.
              </p>
            )}
          </Section>

          {myTeams.length > 0 && (
            <Section title="Meine Mannschaften">
              <ul className="grid gap-3 sm:grid-cols-2">{myTeams.map(card)}</ul>
            </Section>
          )}

          {groupTeams(others).map((group) => (
            <Section key={group.key} title={group.label}>
              <ul className="grid gap-3 sm:grid-cols-2">{group.teams.map(card)}</ul>
            </Section>
          ))}

          {filtered.length === 0 && <p className="card-note">Keine Mannschaft gefunden.</p>}
        </div>
      )}
    </AppLayout>
  );
}

function Section({ title, icon, children }) {
  return (
    <section>
      <h2 className="eyebrow flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TeamCard({ team, relations, favorite, busy, onToggleFavorite }) {
  const meta = teamMeta(team);
  const pending = relations.some((r) => !r.isConfirmed);

  return (
    <li
      className={`flex min-h-16 items-center rounded-md border bg-paper shadow-card transition-colors hover:border-hsg-green ${
        pending ? 'border-warn-line' : 'border-line'
      }`}
    >
      <Link to={`/teams/${team.code}`} className="flex min-w-0 flex-1 items-center gap-3 p-3.5">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-display text-base font-bold tracking-[-0.01em] text-ink">
              {team.name}
            </span>
            {relations.map((r) => (
              <span key={r.relationType} className={`badge ${r.isConfirmed ? 'badge-confirmed' : 'badge-pending'}`}>
                {r.isConfirmed ? relationLabel(r.relationType) : 'ausstehend'}
              </span>
            ))}
          </span>
          {meta && <span className="mt-0.5 block truncate text-xs text-ink-muted">{meta}</span>}
        </span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
      </Link>
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={busy}
        aria-pressed={favorite}
        aria-label={favorite ? `${team.name} aus den Favoriten entfernen` : `${team.name} als Favorit merken`}
        className="flex h-full min-h-16 w-12 shrink-0 items-center justify-center border-l border-line text-ink-muted hover:text-warn"
      >
        <Star size={18} className={favorite ? 'fill-current text-warn' : ''} />
      </button>
    </li>
  );
}
