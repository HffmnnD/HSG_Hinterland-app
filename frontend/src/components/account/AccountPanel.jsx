import { useState } from 'react';
import { CalendarCheck, KeyRound, Palette, Users } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { serviceLabel } from '../../lib/participation';
import { formatDate } from '../../lib/format';
import StatCard from '../ui/StatCard';
import { ThemeChoice } from '../ThemeToggle';
import PreferencesForm from './PreferencesForm';
import PasswordForm from './PasswordForm';

/**
 * Eigenes Segment „Mein Konto" am Fuß der Startseite.
 *
 * Alles, was man an sich selbst einstellen kann, an einer Stelle – und zwar
 * genau die Angaben aus dem Onboarding plus das Passwort. Vorher war das über
 * die App verteilt: Das Design gab es überhaupt nicht, die Mannschaftswahl nur
 * bei der Registrierung (also nie wieder), und ein Passwort liess sich gar
 * nicht ändern.
 *
 * Die drei Bereiche liegen hinter einem Umschalter statt untereinander: Eine
 * Startseite soll nicht mit drei Formularen enden. Geöffnet ist zunächst
 * nichts – man kommt hierher, um etwas zu ändern, nicht um zu lesen.
 */

const TABS = [
  {
    key: 'teams',
    label: 'Mannschaften',
    title: 'Rolle & Mannschaften',
    description:
      'Was du im Verein machst und welche Mannschaften dich betreffen. Steuert, welche Termine du siehst.',
    Icon: Users,
  },
  {
    key: 'design',
    label: 'Design',
    title: 'Design',
    description: 'Hell, dunkel oder wie dein Gerät. Gilt auf allen deinen Geräten.',
    Icon: Palette,
  },
  {
    key: 'passwort',
    label: 'Passwort',
    title: 'Passwort ändern',
    description: 'Zur Bestätigung brauchst du dein aktuelles Passwort.',
    Icon: KeyRound,
  },
];

export default function AccountPanel() {
  const { user, services } = useAuth();
  const { theme } = useTheme();
  const [openTab, setOpenTab] = useState(null);

  if (!user) return null;

  const active = TABS.find((tab) => tab.key === openTab) ?? null;

  return (
    <section className="panel">
      <div className="panel__header">
        <div className="min-w-0">
          <h2 className="section-title text-base">Mein Konto</h2>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{user.email}</p>
        </div>
        <span className="badge badge-confirmed">Freigegeben</span>
      </div>

      <div className="panel__body space-y-4">
        {/* Kennzahlen des eigenen Kontos – dieselbe Kachel wie im
            System-Status, damit die Startseite eine Sprache spricht. */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Mannschaften"
            value={user.teams.length}
            hint={pendingHint(user.teams)}
          />
          <StatCard
            icon={CalendarCheck}
            label="Mitglied seit"
            value={formatDate(user.createdAt)}
            hint={`Mitgliedsnummer ${user.id}`}
          />
          <StatCard
            icon={Palette}
            label="Design"
            value={
              theme === 'system' ? 'System' : theme === 'dark' ? 'Dunkel' : 'Hell'
            }
            hint="Unten unter „Design“ änderbar"
          />
          <StatCard
            icon={KeyRound}
            label="Helferdienste"
            value={services.length > 0 ? services.length : '—'}
            hint={
              services.length > 0
                ? services.map(serviceLabel).join(', ')
                : 'Von der Verwaltung eingetragen'
            }
          />
        </div>

        {/* Umschalter. `aria-expanded` statt Reiter-Rollen: Es ist eine
            Aufklapp-Fläche, kein Reiterwerk mit ständig sichtbarem Inhalt. */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(({ key, label, Icon }) => {
            const isOpen = openTab === key;
            return (
              <button
                key={key}
                type="button"
                aria-expanded={isOpen}
                aria-controls="account-detail"
                onClick={() => setOpenTab(isOpen ? null : key)}
                className={`chip chip-sm ${isOpen ? 'chip-active' : ''}`}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {active && (
          <div
            id="account-detail"
            className="rounded-md border border-line bg-surface/60 p-4"
          >
            <h3 className="section-title text-sm">{active.title}</h3>
            <p className="mt-1 text-xs text-ink-muted">{active.description}</p>

            <div className="mt-4">
              {active.key === 'teams' && <PreferencesForm />}
              {active.key === 'design' && <ThemeChoice />}
              {active.key === 'passwort' && <PasswordForm />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** „1 wartet auf Bestätigung" – oder was sonst zur Mannschaftszahl zu sagen ist. */
function pendingHint(teams) {
  const pending = teams.filter((team) => !team.isConfirmed).length;
  if (teams.length === 0) return 'Noch keine Zuordnung';
  if (pending === 0) return 'Alle bestätigt';
  return pending === 1
    ? '1 wartet auf Bestätigung'
    : `${pending} warten auf Bestätigung`;
}
