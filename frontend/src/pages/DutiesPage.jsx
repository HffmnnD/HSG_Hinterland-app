import { useSearchParams } from 'react-router-dom';

import AppLayout from '../components/AppLayout';
import DutiesSection from '../components/duties/DutiesSection';

/**
 * Reiter „Dienste": offene Dienste zum Eintragen, eigene Dienste und – mit
 * Recht duties.manage – die Verwaltung der Dienstpläne. Der Unterreiter steht
 * in der Adresse (?tab=verwalten), damit Push-Links direkt dorthin führen.
 */
export default function DutiesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');

  return (
    <AppLayout width="max-w-4xl">
      <h1 className="page-title">Dienste</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Kuchenverkauf, Kasse, Zeitnehmer – trag dich ein, wo du helfen kannst.
      </p>
      <div className="mt-5">
        <DutiesSection
          tab={tab}
          onTabChange={(key) => setParams(key === 'offen' ? {} : { tab: key }, { replace: true })}
        />
      </div>
    </AppLayout>
  );
}
