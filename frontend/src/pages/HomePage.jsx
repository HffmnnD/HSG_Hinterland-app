import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  HandHelping,
  Newspaper,
  Radio,
  Settings2,
  Star,
  Users,
} from 'lucide-react';

import AppLayout from '../components/AppLayout';
import Modal from '../components/ui/Modal';
import Avatar from '../components/ui/Avatar';
import NewsCard from '../components/NewsCard';
import MyTeams from '../components/MyTeams';
import NextUpPanel from '../components/dashboard/NextUpPanel';
import CalendarOverview from '../components/calendar/CalendarOverview';
import CalendarExport from '../components/calendar/CalendarExport';
import HomeSettings from '../components/home/HomeSettings';
import { resolveLayout } from '../components/home/widgets';
import { useAuth } from '../context/AuthContext';
import { useNews } from '../hooks/useNews';
import { useApiResource, useEvents } from '../hooks/useSchedule';
import { useDuties } from '../hooks/useDuties';
import { useTeams } from '../hooks/useTeams';
import { apiFetch } from '../lib/api';
import { formatEventDay, formatClock, toDateInput, shiftIsoDate } from '../lib/schedule';

const NEWS_PREVIEW_COUNT = 2;

/**
 * Startseite – aus Kacheln, die jede Person unter „Anpassen" (oder „Mein
 * Konto → Startseite") ein- und ausblendet und umsortiert. Aktuelle News
 * stehen immer ganz oben (nicht verschiebbar), solange es welche gibt.
 *
 * Der frühere Reiter „Kalender" ist hier aufgegangen: die Kalender-Kachel
 * zeigt die Woche, „Als Nächstes" die nächsten Termine, Teamplaner (Zu- und
 * Absagen, Abwesenheiten) liegt einen Tipp entfernt.
 */
export default function HomePage() {
  const { user, actingAs } = useAuth();
  const [customizing, setCustomizing] = useState(false);

  const layout = useMemo(() => resolveLayout(user?.homeLayout), [user?.homeLayout]);
  if (!user) return null;

  // Familie gibt es nur für Eltern (und nicht im Kinderkonto selbst).
  const available = (key) => key !== 'family' || (user.hasChildren && !actingAs);
  const visible = layout.order.filter((key) => !layout.hidden.has(key) && available(key));

  return (
    <AppLayout width="max-w-5xl">
      <header className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-title truncate">Hallo, {user.firstName}!</h1>
        </div>
        <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setCustomizing(true)} aria-label="Startseite anpassen">
          <Settings2 size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Anpassen</span>
        </button>
      </header>

      <TopNews />

      {visible.length === 0 ? (
        <div className="card-note mt-6">
          Alle Kacheln sind ausgeblendet.{' '}
          <button type="button" className="link" onClick={() => setCustomizing(true)}>
            Startseite anpassen
          </button>
        </div>
      ) : (
        <div className="home-grid mt-6">
          {visible.map((key) => {
            const Widget = WIDGETS[key];
            return <Widget key={key} />;
          })}
        </div>
      )}

      {customizing && (
        <Modal title="Startseite anpassen" onClose={() => setCustomizing(false)} size="md">
          <HomeSettings onSaved={() => setCustomizing(false)} />
        </Modal>
      )}
    </AppLayout>
  );
}

function Panel({ icon: Icon, title, action, wide = false, children }) {
  return (
    <section className={`panel min-w-0 ${wide ? 'home-grid__wide' : ''}`}>
      <div className="panel__header">
        <h2 className="section-title flex items-center gap-2 text-base">
          <Icon size={16} aria-hidden="true" className="text-ink-muted" />
          {title}
        </h2>
        {action}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

// --------------------------------------------------------------- Kacheln

function FamilyWidget() {
  const { switchAccount } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/family')
      .then((data) => !cancelled && setChildren(data.children))
      .catch(() => !cancelled && setChildren([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const open = async (child, target) => {
    const result = await switchAccount(child.id);
    if (result.success) navigate(target);
  };

  return (
    <Panel icon={Users} title="Meine Kinder" action={<Link to="/konto?bereich=familie" className="link text-sm">Verwalten</Link>}>
      {!children ? (
        <span className="skeleton h-14 w-full" />
      ) : (
        <ul className="space-y-2">
          {children.map((child) => (
            <li key={child.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-2.5">
              <Avatar person={child} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{child.firstName}</span>
                <span className="block truncate text-xs text-ink-muted">{child.teams.map((t) => t.name).join(', ') || 'Keine Mannschaft'}</span>
              </span>
              <span className="flex gap-1.5">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => open(child, '/training')}>
                  <ClipboardList size={14} aria-hidden="true" /> Teamplaner
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => open(child, '/')} aria-label={`In das Konto von ${child.firstName} wechseln`}>
                  <ArrowLeftRight size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NextWidget() {
  const { events, teams, loading, error } = useEvents({ from: toDateInput(), mine: true });
  return <NextUpPanel events={events} loading={loading} error={error} hasTeams={teams.length > 0} className="min-w-0" />;
}

function LiveWidget() {
  const today = toDateInput();
  const { events, loading } = useEvents({ from: today, to: shiftIsoDate(today, 7), category: 'match', mine: true });
  const { user } = useAuth();
  const { teams } = useTeams();
  const games = events.filter((e) => e.type === 'MATCH' && !e.cancelledAt).slice(0, 4);
  const teamCode = (name) => teams.find((t) => t.name === name)?.code;
  const favoriteNames = teams.filter((t) => user.favoriteTeamIds?.includes(t.id)).map((t) => t.name);

  return (
    <Panel icon={Radio} title="Spiele diese Woche" action={<Link to="/teams" className="link text-sm">Alle Teams</Link>}>
      {loading ? (
        <span className="skeleton h-14 w-full" />
      ) : games.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Diese Woche keine Spiele deiner Mannschaften.
          {favoriteNames.length > 0 && ' Ergebnisse deiner Favoriten findest du auf ihrer Mannschaftsseite.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {games.map((game) => {
            const isToday = game.startTime.slice(0, 10) === today;
            const code = teamCode(game.teamName);
            return (
              <li key={game.id}>
                <Link to={code ? `/teams/${code}?tab=spielplan` : '/training'} className="flex items-center gap-3 rounded-md border border-line px-3 py-2 hover:border-hsg-green">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{game.title}</span>
                    <span className="block text-xs text-ink-muted">
                      {formatEventDay(game.startTime)} · {formatClock(game.startTime)} Uhr · {game.teamName}
                    </span>
                  </span>
                  {isToday && <span className="badge badge-live shrink-0">Heute</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function CalendarWidget() {
  const navigate = useNavigate();
  return (
    <Panel icon={CalendarDays} title="Kalender" wide action={<Link to="/training" className="link text-sm">Teamplaner</Link>}>
      <CalendarOverview compact onOpenDuties={() => navigate('/dienste')} />
      <CalendarExport compact />
    </Panel>
  );
}

function DutiesWidget() {
  const { plans, loading } = useDuties();
  const mine = plans.flatMap((plan) => plan.duties.filter((d) => d.mine).map((duty) => ({ duty, plan })));
  const open = plans.reduce((sum, plan) => sum + plan.duties.filter((d) => !d.started && d.taken < d.capacity).length, 0);

  return (
    <Panel icon={HandHelping} title="Meine Dienste" action={<Link to="/dienste" className="link text-sm">Alle Dienste</Link>}>
      {loading ? (
        <span className="skeleton h-14 w-full" />
      ) : (
        <div className="space-y-2">
          {mine.length === 0 ? (
            <p className="text-sm text-ink-muted">Du bist für keinen Dienst eingetragen.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {mine.slice(0, 4).map(({ duty, plan }) => (
                <li key={duty.id} className="px-3 py-2 text-sm">
                  <span className="block font-bold text-ink">{duty.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {formatEventDay(duty.startTime)} · {formatClock(duty.startTime)} Uhr · {plan.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {open > 0 && (
            <Link to="/dienste" className="btn btn-outline btn-sm">
              {open} {open === 1 ? 'Dienst sucht' : 'Dienste suchen'} noch Helfer:innen
            </Link>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * „Aktuelles aus dem Verein" – fest oben auf der Startseite, aber nur, wenn
 * es Beiträge gibt. Lange Texte sind zugeklappt („Mehr lesen"). Ältere
 * Beiträge stehen unter Verein → Infos.
 */
function TopNews() {
  const { news, loading, error } = useNews({ limit: NEWS_PREVIEW_COUNT });
  if (loading || error || news.length === 0) return null;
  const [spotlight, ...rest] = news;

  return (
    <section className="panel mt-6 min-w-0" aria-labelledby="home-news-title">
      <div className="panel__header">
        <h2 id="home-news-title" className="section-title flex items-center gap-2 text-base">
          <Newspaper size={16} aria-hidden="true" className="text-ink-muted" />
          Aktuelles aus dem Verein
        </h2>
        <Link to="/verein?tab=infos" className="link text-sm">Alle Infos</Link>
      </div>
      <div className="panel__body space-y-4">
        <NewsCard item={spotlight} highlight />
        {rest.map((item) => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function TeamsWidget() {
  const { user } = useAuth();
  const { teams } = useTeams();
  const own = user.teams ?? [];
  const favorites = teams.filter((t) => user.favoriteTeamIds?.includes(t.id) && !own.some((o) => o.id === t.id));

  return (
    <Panel icon={Users} title="Meine Teams" action={<Link to="/teams" className="link text-sm">Alle Teams</Link>}>
      <MyTeams teams={own} emptyHint="Du bist noch keiner Mannschaft zugeordnet." />
      {favorites.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow flex items-center gap-1.5">
            <Star size={12} aria-hidden="true" /> Favoriten
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {favorites.map((team) => (
              <li key={team.id}>
                <Link to={`/teams/${team.code}`} className="chip chip-sm">
                  {team.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

const selectClubEvents = (result) => result?.events ?? [];
const NO_ITEMS = [];

function ClubEventsWidget() {
  const { data: events, loading } = useApiResource(`/api/club-events?from=${toDateInput()}`, selectClubEvents, NO_ITEMS);
  const upcoming = events.filter((event) => !event.cancelledAt).slice(0, 3);

  return (
    <Panel icon={CalendarCheck} title="Vereinstermine" action={<Link to="/verein" className="link text-sm">Alle Termine</Link>}>
      {loading ? (
        <span className="skeleton h-14 w-full" />
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-ink-muted">Keine anstehenden Vereinstermine.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((event) => (
            <li key={event.id}>
              <Link to="/verein" className="flex items-center gap-3 rounded-md border border-line px-3 py-2 hover:border-hsg-green">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{event.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {formatEventDay(event.startTime)} · {formatClock(event.startTime)} Uhr{event.location ? ` · ${event.location}` : ''}
                  </span>
                </span>
                {event.responseOpen && !event.myResponse && <span className="badge badge-pending shrink-0">Antwort offen</span>}
                {event.myResponse?.status === 'yes' && <span className="badge badge-confirmed shrink-0">Dabei</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const WIDGETS = {
  clubEvents: ClubEventsWidget,
  family: FamilyWidget,
  next: NextWidget,
  live: LiveWidget,
  calendar: CalendarWidget,
  duties: DutiesWidget,
  teams: TeamsWidget,
};
