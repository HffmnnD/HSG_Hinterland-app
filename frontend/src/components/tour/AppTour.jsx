import { useEffect, useState } from 'react';
import {
  ClipboardList,
  HandHelping,
  HeartHandshake,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { ADMIN_PERMISSIONS } from '../../lib/roles';
import Modal from '../ui/Modal';
import { PENDING_KEY, START_EVENT, isPending } from '../../lib/tour';

/**
 * Nur das Wichtigste für genau dieses Konto: Spieler:innen sehen den
 * Teamplaner, Trainer:innen ihre Mannschaftsverwaltung, Eltern die Familie,
 * die Vereinsleitung die Verwaltung. Höchstens sieben kurze Schritte.
 */
function buildSteps(user, can) {
  const relations = new Set((user?.teams ?? []).filter((t) => t.isConfirmed !== false).map((t) => t.relationType));
  const isCoach = relations.has('coach');
  const isPlayer = relations.has('player');
  const steps = [
    {
      Icon: Sparkles,
      title: `Willkommen, ${user?.firstName ?? ''}!`,
      text: 'In einer Minute zeigen wir dir das Wichtigste. Du kannst jederzeit abbrechen und die Einführung später unter Einstellungen erneut starten.',
    },
    {
      Icon: LayoutDashboard,
      title: 'Deine Startseite',
      text: 'Oben stehen die aktuellen News. Darunter Kacheln wie Termine, Kalender und Dienste – mit „Anpassen" blendest du sie ein oder aus und ordnest sie, wie du willst.',
    },
    {
      Icon: Star,
      title: 'Teams & Favoriten',
      text: 'Unter „Teams" findest du alle Mannschaften mit Spielplan, Tabelle und Spielverlauf. Mit dem Stern merkst du dir Mannschaften als Favoriten.',
    },
  ];
  if (isPlayer || isCoach) {
    steps.push({
      Icon: ClipboardList,
      title: 'Teamplaner',
      text: isCoach
        ? 'Im Teamplaner deiner Mannschaft legst du Trainings und Spiele an und siehst, wer zu- oder abgesagt hat.'
        : 'Im Teamplaner deiner Mannschaft sagst du für Training und Spiele zu oder ab – bitte immer rechtzeitig.',
    });
  }
  if (isCoach) {
    steps.push({
      Icon: Users,
      title: 'Deine Mannschaft verwalten',
      text: 'Im Reiter „Verwaltung" bestätigst du Beitritte, pflegst den Kader und stellst ein, ob Teamplaner und Strafen genutzt werden. Spielberichte schreibst du unter Verein → Infos.',
    });
  }
  steps.push({
    Icon: HandHelping,
    title: 'Dienste & Verein',
    text: 'Unter „Dienste" übernimmst du Helferdienste. Unter „Verein" stehen Vereinstermine sowie Spielberichte, News und Dokumente.',
  });
  if (user?.hasChildren) {
    steps.push({
      Icon: HeartHandshake,
      title: 'Familie',
      text: 'Über dein Profilbild oben rechts wechselst du in das Konto deines Kindes und sagst dort für es zu oder ab.',
    });
  }
  if (can?.(...ADMIN_PERMISSIONS)) {
    steps.push({
      Icon: ShieldCheck,
      title: 'Verwaltung',
      text: 'Im Reiter „Verwaltung" pflegst du Mitglieder, News, Mannschaften und die App-Einstellungen (Logo, Login-Bild und -Sprüche).',
    });
  }
  steps.push({
    Icon: Settings,
    title: 'Einstellungen',
    text: 'Das Zahnrad (am Handy unten rechts) führt zu deinen Einstellungen: Profil und Name, Mannschaften, Benachrichtigungen, Kalender-Abo – und diese Einführung.',
  });
  return steps;
}

/**
 * Kurze Einführung als Dialog. Läuft einmal direkt nach der Kontoeröffnung
 * und jederzeit über Einstellungen → Einführung. Abbrechen geht immer.
 */
export default function AppTour() {
  const { user, can } = useAuth();
  const [open, setOpen] = useState(() => isPending());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const start = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, []);

  if (!open || !user) return null;

  const steps = buildSteps(user, can);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const close = () => {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* egal */
    }
    setOpen(false);
  };
  const { Icon } = step;

  return (
    <Modal title="Einführung" onClose={close} size="sm">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-hsg-green-soft text-hsg-green-dark">
          <Icon size={26} aria-hidden="true" />
        </span>
        <h3 className="section-title mt-4 text-lg">{step.title}</h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{step.text}</p>

        <div className="mt-5 flex justify-center gap-1.5" aria-label={`Schritt ${index + 1} von ${steps.length}`}>
          {steps.map((entry, i) => (
            <span
              key={entry.title}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-hsg-green' : 'w-1.5 bg-line-strong'}`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {index > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIndex((i) => i - 1)}>
              Zurück
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Überspringen
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => (last ? close() : setIndex((i) => i + 1))}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
