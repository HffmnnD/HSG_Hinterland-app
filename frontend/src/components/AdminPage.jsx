import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
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
const RolesSection = lazy(() => import('./admin/RolesSection'));
const BackupsSection = lazy(() => import('./admin/BackupsSection'));
const BrandingSection = lazy(() => import('./admin/BrandingSection'));

/**
 * Alle Bereiche der Verwaltung an EINER Stelle definiert – Reiterleiste und
 * Inhaltsauswahl speisen sich daraus. So kann kein Reiter auftauchen, zu dem
 * es keinen Bereich gibt (oder umgekehrt).
 *
 * `permissions`: sichtbar mit mindestens einem dieser Rechte. Das Backend prüft
 * jeden Endpunkt ohnehin selbst – hier wird nur nicht angeboten, was nicht geht.
 */
const SECTIONS = [
  {
    key: 'mitglieder',
    label: 'Mitglieder',
    title: 'Mitgliederverwaltung',
    permissions: ['members.view'],
    Component: MembersSection,
  },
  {
    key: 'news',
    label: 'News',
    title: 'News & Beiträge',
    permissions: ['news.manage'],
    Component: NewsSection,
  },
  {
    key: 'mannschaften',
    label: 'Mannschaften',
    title: 'Mannschaftsverwaltung',
    permissions: ['teams.create', 'teams.edit'],
    Component: TeamsSection,
  },
  {
    key: 'system',
    label: 'System-Status',
    title: 'System-Status',
    permissions: ['system.view'],
    Component: SystemSection,
  },
  {
    key: 'rechte',
    label: 'Rollen & Rechte',
    title: 'Rollen & Rechte',
    permissions: ['access.manage', 'members.roles'],
    Component: RolesSection,
  },
  {
    key: 'app',
    label: 'App-Einstellungen',
    title: 'App-Einstellungen',
    permissions: ['settings.manage'],
    Component: BrandingSection,
  },
  {
    key: 'sicherungen',
    label: 'Datensicherung',
    title: 'Datensicherung',
    permissions: ['backups.manage'],
    Component: BackupsSection,
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
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const sections = useMemo(
    () => SECTIONS.filter((section) => can(...section.permissions)),
    [can]
  );

  const requested = searchParams.get('bereich');
  // `sections` kann heute nicht leer sein (der Bereich „Mitglieder" ist für
  // alle Verwaltungsrollen sichtbar). Der Zugriff auf `sections[0]` wäre aber
  // die Stelle, die still mit „cannot read property 'key' of undefined"
  // abstürzt, sobald jemand künftig auch dort `adminOnly` setzt.
  const active =
    sections.find((section) => section.key === requested) ?? sections[0] ?? null;

  // Unbekannter oder unerlaubter Bereich in der Adresse (alter Link, Tippfehler,
  // Trainer:in öffnet einen Admin-Link): still auf den ersten Bereich
  // zurückfallen, statt eine leere Seite zu zeigen.
  useEffect(() => {
    if (active && requested && requested !== active.key) {
      setSearchParams({ bereich: active.key }, { replace: true });
    }
  }, [requested, active, setSearchParams]);

  const selectSection = (key) => {
    setSearchParams(key === DEFAULT_SECTION ? {} : { bereich: key }, {
      replace: true,
    });
  };

  if (!active) {
    return (
      <AppLayout width="max-w-7xl">
        <h1 className="page-title">Verwaltung</h1>
        <div role="alert" className="alert alert-info mt-4">
          Kein Bereich freigeschaltet.
        </div>
      </AppLayout>
    );
  }

  const ActiveSection = active.Component;

  return (
    <AppLayout width="max-w-7xl">
      <h1 className="page-title">Verwaltung</h1>

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
