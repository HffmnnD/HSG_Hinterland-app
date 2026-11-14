import { useSearchParams } from 'react-router-dom';

import AppLayout from '../components/AppLayout';
import TrainingSection from '../components/schedule/TrainingSection';

/**
 * Teamplaner über alle eigenen Mannschaften: anstehende Termine mit Zu-/
 * Absage, Abwesenheiten, Beteiligung und (für Trainer:innen) Planung.
 *
 * Dieselbe Ansicht steckt für jede einzelne Mannschaft im Reiter „Training"
 * der Mannschaftsseite. Hier landen Push-Links und der Knopf „Teamplaner"
 * der Startseite – und Eltern im Kinderkonto.
 */
export default function TrainingPage() {
  const [params, setParams] = useSearchParams();

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Teamplaner</h1>
      <p className="mt-1 text-sm text-ink-muted">Training, Spiele und Termine aller deiner Mannschaften.</p>
      <div className="mt-5">
        <TrainingSection
          tab={params.get('tab')}
          onTabChange={(key) => setParams(key === 'anstehend' ? {} : { tab: key }, { replace: true })}
        />
      </div>
    </AppLayout>
  );
}
