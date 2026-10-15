import { useState } from 'react';
import { CalendarCheck, KeyRound, Palette, UserRound, Users } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/format';
import StatCard from '../ui/StatCard';
import Avatar from '../ui/Avatar';
import ThemeChoice from '../ThemeChoice';
import ProfileForm from './ProfileForm';
import PreferencesForm from './PreferencesForm';
import PasswordForm from './PasswordForm';
import { pushAccountTab } from '../../push';

/**
 * Eigenes Segment „Mein Konto" am Fuß der Startseite.
 *
 * Alles, was man an sich selbst einstellen kann, an einer Stelle – und zwar
 * genau die Angaben aus dem Onboarding plus das Passwort. Vorher war das über
 * die App verteilt: Das Design gab es überhaupt nicht, die Mannschaftswahl nur
 * bei der Registrierung (also nie wieder), und ein Passwort liess sich gar
 * nicht ändern.
 *
 * Die vier Bereiche liegen hinter einem Umschalter statt untereinander: Eine
 * Startseite soll nicht mit vier Formularen enden. Geöffnet ist zunächst
 * nichts – man kommt hierher, um etwas zu ändern, nicht um zu lesen. Das
 * spart zugleich Arbeit: Die Mannschaftsliste wird erst geladen, wenn jemand
 * den Bereich „Mannschaften" wirklich aufklappt.
 */

const TABS = [
  {
    key: 'profil',
    label: 'Profil',
    title: 'Profilbild & Kontakt',
    Icon: UserRound,
  },
  {
    key: 'teams',
    label: 'Mannschaften',
    title: 'Rolle & Mannschaften',
    Icon: Users,
  },
  {
    key: 'design',
    label: 'Design',
    title: 'Design',
    Icon: Palette,
  },
  {
    key: 'passwort',
    label: 'Passwort',
    title: 'Passwort ändern',
    Icon: KeyRound,
  },
  pushAccountTab,
];

export default function AccountPanel() {
  const { user } = useAuth();
  const [openTab, setOpenTab] = useState(null);

  if (!user) return null;

  const active = TABS.find((tab) => tab.key === openTab) ?? null;

  return (
    <section className="panel">
      <div className="panel__header">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={user} size="sm" />
          <div className="min-w-0">
            <h2 className="section-title text-base">Mein Konto</h2>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="panel__body space-y-4">
        {/* Kennzahlen des eigenen Kontos – dieselbe Kachel wie im
            System-Status, damit die Startseite eine Sprache spricht. */}
        <div className="grid grid-cols-2 gap-3">
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

            <div className="mt-4">
              {active.key === 'profil' && <ProfileForm />}
              {active.key === 'teams' && <PreferencesForm />}
              {active.key === 'design' && <ThemeChoice />}
              {active.key === 'passwort' && <PasswordForm />}
              {active.key === pushAccountTab.key && <pushAccountTab.Component />}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** „1 wartet auf Bestätigung" – nur wenn etwas offen ist. */
function pendingHint(teams) {
  const pending = teams.filter((team) => !team.isConfirmed).length;
  if (pending === 0) return undefined;
  return pending === 1
    ? '1 wartet auf Bestätigung'
    : `${pending} warten auf Bestätigung`;
}
