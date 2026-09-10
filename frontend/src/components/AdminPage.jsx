import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Newspaper, Shield, Users } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES } from '../lib/roles';
import AppLayout from './AppLayout';
import { RoleBadge } from './Badge';
import { Loading } from './admin/ui/Feedback';

// Die Bereiche werden erst geladen, wenn sie geöffnet werden.
//
// Das ist hier kein vorsorgliches Feintuning, sondern rechnet sich sofort:
// der System-Status bringt die Diagramm-Bibliothek mit, die allein rund
// 130 kB (gepackt) wiegt. Läge sie im Hauptbündel, müsste JEDES Mitglied sie
// beim Öffnen der App herunterladen – für eine Seite, die nur Admins je zu
// sehen bekommen. Als eigene Teilstücke zahlt sie nur, wer sie aufruft.
const MembersSection = lazy(() => import('./admin/MembersSection'));
const NewsSection = lazy(() => import('./admin/NewsSection'));
const TeamsSection = lazy(() => import('./admin/TeamsSection'));
const SystemSection = lazy(() => import('./admin/SystemSection'));

/**
 * Alle Bereiche der Verwaltung an EINER Stelle definiert – die Seitenleiste,
 * die mobile Reiterleiste und die Inhaltsauswahl speisen sich daraus. So kann
 * kein Bereich in der Navigation auftauchen, den es gar nicht gibt (oder
 * umgekehrt).
 *
 * `adminOnly` blendet einen Bereich für Trainer:innen aus. Das Backend lehnt
 * die zugehörigen Endpunkte ohnehin ab (siehe routes/adminRoutes.js) – hier
 * wird nur gar nicht erst etwas angeboten, das nicht geht.
 */
const SECTIONS = [
  {
    key: 'mitglieder',
    label: 'Mitglieder',
    icon: Users,
    title: 'Mitgliederverwaltung',
    description: 'Rollen, Sperren und Mannschaftszuordnungen der Vereinsmitglieder.',
    Component: MembersSection,
  },
  {
    key: 'news',
    label: 'News',
    icon: Newspaper,
    title: 'News & Beiträge',
    description: 'Beiträge veröffentlichen, archivieren und aus dem Archiv zurückholen.',
    adminOnly: true,
    Component: NewsSection,
  },
  {
    key: 'mannschaften',
    label: 'Mannschaften',
    icon: Shield,
    title: 'Mannschaftsverwaltung',
    description: 'Mannschaften anlegen und ihre Stammdaten samt nuLiga-Anbindung pflegen.',
    adminOnly: true,
    Component: TeamsSection,
  },
  {
    key: 'system',
    label: 'System-Status',
    icon: Activity,
    title: 'System-Status',
    description: 'Auslastung, Verkehr und Zustand des Servers.',
    adminOnly: true,
    Component: SystemSection,
  },
];

/**
 * Verwaltungsbereich (/admin).
 *
 * Aufbau: links eine Bereichsnavigation (am Handy eine Reiterleiste oben),
 * rechts genau EIN Bereich. Jeder Bereich lädt seine Daten selbst, sobald er
 * sichtbar wird – die Seite holt also nie Mitglieder, System-Kennzahlen und
 * News auf einmal, sondern nur das, was gerade angezeigt wird.
 *
 * Der gewählte Bereich steht in der Adresse (`/admin?bereich=news`). Damit
 * lässt sich ein Bereich verlinken, und der Zurück-Knopf des Browsers tut das
 * Erwartbare.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManageAccounts = ADMIN_ROLES.includes(user?.role);
  const isSubAdmin = user?.role === 'sub_admin';

  const sections = useMemo(
    () => SECTIONS.filter((section) => !section.adminOnly || canManageAccounts),
    [canManageAccounts]
  );

  const requested = searchParams.get('bereich');
  const active = sections.find((section) => section.key === requested) ?? sections[0];

  // Unbekannter oder unerlaubter Bereich in der Adresse (alter Link, Tippfehler,
  // Trainer:in öffnet einen Admin-Link): still auf den ersten Bereich
  // zurückfallen, statt eine leere Seite zu zeigen.
  useEffect(() => {
    if (requested && requested !== active.key) {
      setSearchParams({ bereich: active.key }, { replace: true });
    }
  }, [requested, active.key, setSearchParams]);

  const select = (key) => setSearchParams(key === sections[0].key ? {} : { bereich: key });

  const ActiveSection = active.Component;

  return (
    <AppLayout width="max-w-7xl">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Verwaltung</h1>
          <RoleBadge role={user?.role} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">{active.description}</p>
      </header>

      {isSubAdmin && active.key === 'mitglieder' && (
        <div className="alert alert-info mt-3">
          Als Sub-Admin kannst du Admin-Konten nicht bearbeiten und die Rolle
          „Admin“ nicht vergeben.
        </div>
      )}

      {/* Mobile Reiterleiste – ersetzt die Seitenleiste unterhalb von `lg`. */}
      <nav className="admin-tabs mt-4" aria-label="Bereiche der Verwaltung">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => select(section.key)}
            aria-current={section.key === active.key ? 'page' : undefined}
            className={`admin-tabs__item ${
              section.key === active.key ? 'admin-tabs__item--active' : ''
            }`}
          >
            <section.icon size={14} aria-hidden="true" />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="admin-layout">
        {/* Seitenleiste am Desktop */}
        <nav className="admin-rail" aria-label="Bereiche der Verwaltung">
          <div className="admin-rail__list">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => select(section.key)}
                aria-current={section.key === active.key ? 'page' : undefined}
                className={`admin-rail__item ${
                  section.key === active.key ? 'admin-rail__item--active' : ''
                }`}
              >
                <section.icon size={16} aria-hidden="true" className="shrink-0" />
                {section.label}
              </button>
            ))}
          </div>

          <p className="mt-3 px-2 text-xs leading-relaxed text-ink-muted">
            {canManageAccounts
              ? 'Änderungen greifen sofort für alle Mitglieder.'
              : 'Als Trainer:in verwaltest du die Mannschaftszuordnung der Mitglieder.'}
          </p>
        </nav>

        {/* Inhalt. `key` erzwingt einen frischen Zustand beim Bereichswechsel –
            sonst würde z. B. eine offene Suche im nächsten Bereich nachwirken. */}
        <div className="mt-4 min-w-0 lg:mt-0">
          <Suspense fallback={<Loading>{active.title} wird geladen …</Loading>}>
            <ActiveSection key={active.key} />
          </Suspense>
        </div>
      </div>
    </AppLayout>
  );
}
