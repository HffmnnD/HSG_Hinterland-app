import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES } from '../lib/roles';
import AppLayout from './AppLayout';
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
 * Alle Bereiche der Verwaltung an EINER Stelle definiert – Reiterleiste und
 * Inhaltsauswahl speisen sich daraus. So kann kein Reiter auftauchen, zu dem
 * es keinen Bereich gibt (oder umgekehrt).
 *
 * `adminOnly` blendet einen Bereich für Trainer:innen aus. Das Backend lehnt
 * die zugehörigen Endpunkte ohnehin ab (siehe routes/adminRoutes.js) – hier
 * wird nur gar nicht erst etwas angeboten, das nicht geht.
 */
const SECTIONS = [
  {
    key: 'mitglieder',
    label: 'Mitglieder',
    title: 'Mitgliederverwaltung',
    description: 'Rollen, Sperren und Mannschaftszuordnungen der Vereinsmitglieder.',
    Component: MembersSection,
  },
  {
    key: 'news',
    label: 'News',
    title: 'News & Beiträge',
    description: 'Beiträge veröffentlichen, archivieren und aus dem Archiv zurückholen.',
    adminOnly: true,
    Component: NewsSection,
  },
  {
    key: 'mannschaften',
    label: 'Mannschaften',
    title: 'Mannschaftsverwaltung',
    description: 'Mannschaften anlegen und ihre Stammdaten samt nuLiga-Anbindung pflegen.',
    adminOnly: true,
    Component: TeamsSection,
  },
  {
    key: 'system',
    label: 'System-Status',
    title: 'System-Status',
    description: 'Auslastung, Verkehr und Zustand des Servers.',
    adminOnly: true,
    Component: SystemSection,
  },
];

const DEFAULT_SECTION = SECTIONS[0].key;

/**
 * Verwaltungsbereich (/admin).
 *
 * Die Reiterleiste ist dieselbe wie auf der Mannschaftsseite – gleiche Klassen
 * (`.tabs` / `.tab` / `.tab--active`), gleiche ARIA-Rollen, gleiches Verhalten
 * (`replace`, damit das Blättern nicht die Historie füllt). Reiter sollen
 * überall in der App gleich aussehen und sich gleich anfühlen; zwei eigene
 * Navigationsmuster für dieselbe Aufgabe wären reine Willkür.
 *
 * Jeder Bereich lädt seine Daten selbst, sobald er sichtbar wird – die Seite
 * holt also nie Mitglieder, System-Kennzahlen und News auf einmal, sondern nur
 * das, was gerade angezeigt wird.
 *
 * Der gewählte Bereich steht in der Adresse (`/admin?bereich=news`). Damit
 * lässt sich ein Bereich verlinken, und der Zurück-Knopf des Browsers tut das
 * Erwartbare.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManageAccounts = ADMIN_ROLES.includes(user?.role);

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

  const selectSection = (key) => {
    setSearchParams(key === DEFAULT_SECTION ? {} : { bereich: key }, {
      replace: true,
    });
  };

  const ActiveSection = active.Component;

  return (
    <AppLayout width="max-w-7xl">
      <header>
        <h1 className="page-title">Verwaltung</h1>
        <p className="mt-1 text-sm text-ink-muted">{active.description}</p>
      </header>

      <div className="tabs mt-6" role="tablist" aria-label="Bereiche der Verwaltung">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            role="tab"
            id={`tab-${section.key}`}
            aria-selected={active.key === section.key}
            aria-controls={`panel-${section.key}`}
            onClick={() => selectSection(section.key)}
            className={`tab ${active.key === section.key ? 'tab--active' : ''}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* `key` erzwingt einen frischen Zustand beim Bereichswechsel – sonst
          würde z. B. eine offene Suche im nächsten Bereich nachwirken. */}
      <div
        id={`panel-${active.key}`}
        role="tabpanel"
        aria-labelledby={`tab-${active.key}`}
        className="mt-6"
      >
        <Suspense fallback={<Loading>{active.title} wird geladen …</Loading>}>
          <ActiveSection key={active.key} />
        </Suspense>
      </div>
    </AppLayout>
  );
}
