import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Newspaper, ShieldCheck, Users } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useNews } from '../hooks/useNews';
import { useEvents } from '../hooks/useSchedule';
import { MANAGEMENT_ROLES } from '../lib/roles';
import { toDateInput } from '../lib/schedule';
import AppLayout from './AppLayout';
import Avatar from './ui/Avatar';
import MyTeams from './MyTeams';
import NewsCard from './NewsCard';
import NextUpPanel from './dashboard/NextUpPanel';
import AccountPanel from './account/AccountPanel';

// So viele Beiträge zeigt der Feed zunächst; der Rest kommt per Klick nach.
const NEWS_PREVIEW_COUNT = 5;

/**
 * Startseite.
 *
 * Aufbau von oben nach unten nach der Frage, weshalb jemand die App öffnet:
 *
 *   1. Aktuelles aus dem Verein – der jüngste Beitrag als Aufmacher
 *   2. Meine Mannschaften + „Als Nächstes" – Training und Spiele auf einen Blick
 *   3. Mein Konto – Einstellungen, die man selten, aber gezielt sucht
 *
 * Die Gestaltung folgt dem System-Status der Verwaltung: Abschnittskarten
 * (`.panel`) mit Kopfzeile und feiner Kontur, Kennzahlen als Kacheln. Das war
 * der am besten ausgearbeitete Bereich der App – statt daneben eine zweite
 * Formensprache zu erfinden, benutzt die Startseite dieselben Bauteile.
 */
export default function Dashboard() {
  const { user, role, teams } = useAuth();
  const [showAllNews, setShowAllNews] = useState(false);

  const {
    news,
    loading: newsLoading,
    error: newsError,
  } = useNews(showAllNews ? {} : { limit: NEWS_PREVIEW_COUNT });

  // Die nächsten Termine der eigenen Mannschaften. Ab heute – der Rückblick
  // gehört in den Kalender, nicht auf die Startseite.
  const {
    events,
    teams: scheduleTeams,
    loading: eventsLoading,
    error: eventsError,
  } = useEvents({ from: toDateInput() });

  // Normalerweise garantiert ProtectedRoute einen Nutzer. Der Guard verhindert
  // einen Absturz, falls die Sitzung während des Renderns wegfällt.
  if (!user) return null;

  const isAdmin = role === 'admin';
  const isSubAdmin = role === 'sub_admin';
  const canManageMembers = MANAGEMENT_ROLES.includes(role);

  // Wurde der Vorschau-Umfang exakt ausgeschöpft, gibt es vermutlich mehr.
  const mayHaveMoreNews = !showAllNews && news.length === NEWS_PREVIEW_COUNT;

  const [spotlight, ...rest] = news;

  return (
    <AppLayout width="max-w-5xl">
      {/* ------------------------------------------------------- Begrüßung */}
      <header className="flex items-center gap-4">
        <Avatar person={user} size="lg" />
        <div className="min-w-0">
          <h1 className="page-title">Hallo, {user.firstName}!</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Alles Wichtige aus der HSG Hinterland auf einen Blick.
          </p>
        </div>
      </header>

      {/* -------------------------------------------- Aktuelles aus dem Verein */}
      <section className="panel mt-6">
        <div className="panel__header">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Newspaper size={16} aria-hidden="true" className="text-ink-muted" />
            Aktuelles aus dem Verein
          </h2>
          {news.length > 0 && !newsLoading && (
            <span className="eyebrow">
              {showAllNews ? 'Alle Beiträge' : 'Neueste Beiträge'}
            </span>
          )}
        </div>

        <div className="panel__body">
          {newsError && (
            <div role="alert" className="alert alert-error">
              {newsError}
            </div>
          )}

          {newsLoading ? (
            <div className="space-y-3" aria-hidden="true">
              <span className="skeleton h-40 w-full" />
              <span className="skeleton h-20 w-full" />
            </div>
          ) : news.length === 0 ? (
            <p className="card-note">
              Noch keine Ankündigungen veröffentlicht.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Der jüngste Beitrag als Aufmacher, der Rest darunter in
                  gewohnter Größe. */}
              <NewsCard item={spotlight} highlight />
              {rest.map((item) => (
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
        </div>
      </section>

      {/* ------------------------- Meine Mannschaften & nächste Termine */}
      {/* `min-w-0` an den beiden Karten ist kein Feinschliff, sondern der
          Grund, warum die Startseite auf dem Handy nicht mehr waagerecht
          scrollt: Ein Grid-Element hat von sich aus `min-width: auto` und
          wächst damit bis zur kleinstmöglichen Breite seines Inhalts. Ein
          langer Mannschaftsname („HSG Hinterland – TV Hüttenberg II") schob
          so die ganze Karte über den Bildschirmrand hinaus – und mit ihr die
          Seite. */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="panel min-w-0">
          <div className="panel__header">
            <h2 className="section-title flex items-center gap-2 text-base">
              <Users size={16} aria-hidden="true" className="text-ink-muted" />
              Meine Mannschaften
            </h2>
            <Link to="/teams" className="link text-sm">
              Alle Mannschaften
            </Link>
          </div>
          <div className="panel__body">
            <MyTeams
              teams={teams}
              emptyHint="Du bist noch keiner Mannschaft zugeordnet. Unter „Mein Konto“ kannst du auswählen, wo du mitmachst."
            />
          </div>
        </section>

        <NextUpPanel
          events={events}
          loading={eventsLoading}
          error={eventsError}
          hasTeams={scheduleTeams.length > 0}
          className="min-w-0"
        />
      </div>

      {/* --------------------------------------------------------- Mein Konto */}
      <div className="mt-5">
        <AccountPanel />
      </div>

      {/* Verwaltung: Admins, Sub-Admins und Trainer:innen */}
      {canManageMembers && (
        <section className="panel mt-5">
          <div className="panel__header">
            <h2 className="section-title flex items-center gap-2 text-base">
              <ShieldCheck size={16} aria-hidden="true" className="text-ink-muted" />
              {isAdmin || isSubAdmin ? 'Administration' : 'Mannschaftsverwaltung'}
            </h2>
          </div>
          <div className="panel__body flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-ink-soft">
              {isAdmin &&
                'Rollen und Mannschaften pflegen, News veröffentlichen und den Systemzustand prüfen.'}
              {isSubAdmin &&
                'Rollen und Mannschaften pflegen sowie News veröffentlichen. Admin-Konten sind für dich gesperrt.'}
              {!isAdmin &&
                !isSubAdmin &&
                'Mannschaftszuordnungen der Mitglieder verwalten.'}
            </p>
            <Link to="/admin" className="btn btn-primary btn-sm">
              Zur Verwaltung
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}
    </AppLayout>
  );
}
