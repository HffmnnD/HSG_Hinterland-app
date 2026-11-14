import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarPlus,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Palette,
  Sparkles,
  UserRound,
  Users,
  HeartHandshake,
} from 'lucide-react';

import AppLayout from '../components/AppLayout';
import Avatar from '../components/ui/Avatar';
import ThemeChoice from '../components/ThemeChoice';
import ProfileForm from '../components/account/ProfileForm';
import PreferencesForm from '../components/account/PreferencesForm';
import PasswordForm from '../components/account/PasswordForm';
import FamilySection from '../components/account/FamilySection';
import HomeSettings from '../components/home/HomeSettings';
import CalendarExport from '../components/calendar/CalendarExport';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/roles';
import { formatDate } from '../lib/format';
import { pushAccountTab } from '../push';
import { startTour } from '../lib/tour';

/** Einführung erneut starten – jederzeit abbrechbar. */
function TourSection() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        Die kurze Einführung zeigt dir in wenigen Schritten das Wichtigste – passend zu deinem Konto.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={startTour}>
        <Sparkles size={15} aria-hidden="true" /> Einführung starten
      </button>
    </div>
  );
}

/**
 * „Mein Konto" – alle persönlichen Einstellungen an EINER Stelle, als
 * aufklappbare Liste (am Handy wie in den System-Einstellungen gewohnt).
 * Der offene Bereich steht in der Adresse (?bereich=familie), damit Links
 * direkt dorthin führen.
 */
const SECTIONS = [
  { key: 'profil', label: 'Profil & Kontakt', hint: 'Name, Profilbild, Telefonnummer', Icon: UserRound, Component: ProfileForm },
  { key: 'mannschaften', label: 'Rolle & Mannschaften', hint: 'Wo du spielst, trainierst oder Fan bist', Icon: Users, Component: PreferencesForm },
  { key: 'familie', label: 'Familie', hint: 'Kinder verknüpfen, Teamplaner für dein Kind', Icon: HeartHandshake, Component: FamilySection, ownOnly: true },
  { key: 'startseite', label: 'Startseite', hint: 'Welche Kacheln du siehst und in welcher Reihenfolge', Icon: LayoutDashboard, Component: HomeSettings },
  { key: pushAccountTab.key, label: 'Benachrichtigungen', hint: pushAccountTab.description, Icon: pushAccountTab.Icon, Component: pushAccountTab.Component, ownOnly: true },
  { key: 'kalender', label: 'Kalender-Abo', hint: 'Termine in Google, Apple oder Outlook', Icon: CalendarPlus, Component: CalendarExport },
  { key: 'design', label: 'Design', hint: 'Hell, dunkel oder wie das Gerät', Icon: Palette, Component: ThemeChoice },
  { key: 'passwort', label: 'Passwort', hint: 'Passwort ändern', Icon: KeyRound, Component: PasswordForm, ownOnly: true },
  { key: 'einfuehrung', label: 'Einführung', hint: 'Die wichtigsten Funktionen kurz erklärt', Icon: Sparkles, Component: TourSection },
];

export default function AccountPage() {
  const { user, logout, actingAs } = useAuth();
  const [params, setParams] = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);
  const open = params.get('bereich');

  if (!user) return null;

  const sections = SECTIONS.filter((s) => !(actingAs && s.ownOnly));
  const toggle = (key) => setParams(open === key ? {} : { bereich: key }, { replace: true });

  return (
    <AppLayout width="max-w-3xl">
      <header className="flex items-center gap-4">
        <Avatar person={user} size="xl" />
        <div className="min-w-0">
          <h1 className="page-title truncate">
            {user.firstName} {user.lastName}
          </h1>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {roleLabel(user.role)}
            {user.email ? ` · ${user.email}` : ''}
          </p>
          <p className="text-xs text-ink-muted">
            Mitglied seit {formatDate(user.createdAt)} · Nr. {user.id}
          </p>
        </div>
      </header>

      <ul className="list-panel mt-6">
        {sections.map(({ key, label, hint, Icon, Component }) => {
          const isOpen = open === key;
          return (
            <li key={key}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hsg-green-soft text-hsg-green-dark">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{label}</span>
                  <span className="block truncate text-xs text-ink-muted">{hint}</span>
                </span>
                <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-line bg-surface/50 px-4 py-4">
                  <Component />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!actingAs && (
        <button
          type="button"
          onClick={async () => {
            setLoggingOut(true);
            await logout();
          }}
          disabled={loggingOut}
          className="btn btn-outline btn-block mt-6"
        >
          <LogOut size={16} aria-hidden="true" />
          {loggingOut ? 'Abmelden …' : 'Abmelden'}
        </button>
      )}
    </AppLayout>
  );
}
