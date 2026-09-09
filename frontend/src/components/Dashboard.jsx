import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useNews } from '../hooks/useNews';
import { MANAGEMENT_ROLES, roleLabel } from '../lib/roles';
import { serviceLabel } from '../lib/participation';
import { formatDate } from '../lib/format';
import AppLayout from './AppLayout';
import MyTeams from './MyTeams';
import NewsCard from './NewsCard';
import { RoleBadge } from './Badge';

// So viele Beiträge zeigt der Feed zunächst; der Rest kommt per Klick nach.
const NEWS_PREVIEW_COUNT = 5;

export default function Dashboard() {
  const { user, role, teams, services } = useAuth();
  const [showAllNews, setShowAllNews] = useState(false);

  const {
    news,
    loading: newsLoading,
    error: newsError,
  } = useNews(showAllNews ? {} : { limit: NEWS_PREVIEW_COUNT });

  // Normalerweise garantiert ProtectedRoute einen Nutzer. Der Guard verhindert
  // einen Absturz, falls die Sitzung während des Renderns wegfällt.
  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    .toUpperCase()
    .trim();

  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';
  const canManageMembers = MANAGEMENT_ROLES.includes(role);

  // Wurde der Vorschau-Umfang exakt ausgeschöpft, gibt es vermutlich mehr.
  const mayHaveMoreNews = !showAllNews && news.length === NEWS_PREVIEW_COUNT;

  return (
    <AppLayout width="max-w-3xl">
      {/* Profil */}
      <section className="flex items-center gap-4">
        <div className="avatar h-14 w-14 text-lg">{initials || '?'}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">Willkommen, {user.firstName}!</h1>
            <RoleBadge role={role} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span className="truncate">{user.email}</span>
            <span className="tag" title="Deine Rolle">
              {roleLabel(role)}
            </span>
          </div>
        </div>
      </section>

      {/* Aktuelle Vereins-News */}
      <section className="mt-8">
        <h2 className="section-title">Aktuelles aus dem Verein</h2>

        {newsError && (
          <div role="alert" className="alert alert-error mt-3">
            {newsError}
          </div>
        )}

        {newsLoading ? (
          <p className="mt-3 text-sm text-ink-muted">Beiträge werden geladen …</p>
        ) : news.length === 0 ? (
          <div className="card-note mt-3">
            Noch keine Ankündigungen veröffentlicht.
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {news.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {mayHaveMoreNews && (
          <button
            type="button"
            onClick={() => setShowAllNews(true)}
            className="btn btn-outline btn-sm mt-4"
          >
            Ältere Beiträge anzeigen
          </button>
        )}
      </section>

      {/* Meine Mannschaften */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Meine Mannschaften</h2>
          <Link to="/teams" className="link text-sm">
            Alle Mannschaften
          </Link>
        </div>
        <div className="card mt-3">
          <MyTeams teams={teams} />
        </div>
      </section>

      {/* Konto & Helferdienste */}
      <section className="mt-8">
        <h2 className="section-title">Mein Konto</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="card">
            <p className="eyebrow">Kontostatus</p>
            <p className="status mt-2 text-ink">
              <span className="status-dot bg-hsg-green" />
              Aktiv
            </p>
          </div>

          <div className="card">
            <p className="eyebrow">Mitglied seit</p>
            <p className="mt-2 text-sm text-ink-soft">
              {formatDate(user.createdAt)}
            </p>
          </div>
        </div>

        {services.length > 0 && (
          <div className="card mt-4">
            <p className="eyebrow">Meine Helferdienste</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {services.map((service) => (
                <span key={service} className="tag">
                  {serviceLabel(service)}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Verwaltung: Admins, Sub-Admins und Trainer:innen */}
      {canManageMembers && (
        <div className="card-accent mt-8">
          <div className="flex items-center gap-2">
            <RoleBadge role={role} />
            <h2 className="section-title text-base">
              {isAdmin || isSubAdmin ? 'Administration' : 'Mannschaftsverwaltung'}
            </h2>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {isAdmin &&
              'Verwalte Mitglieder, Rollen, Mannschaftszuordnungen und die Vereins-News.'}
            {isSubAdmin &&
              'Verwalte Mitglieder, Rollen, Mannschaften und die Vereins-News. Admin-Konten sind für dich gesperrt.'}
            {!isAdmin &&
              !isSubAdmin &&
              'Ändere die Mannschaftszuordnung der Mitglieder.'}
          </p>
          <Link to="/admin" className="btn btn-primary mt-4">
            Zur Verwaltung
          </Link>
        </div>
      )}
    </AppLayout>
  );
}
