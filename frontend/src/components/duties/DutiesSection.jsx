import { useAuth } from '../../context/AuthContext';
import DutyBoard from './DutyBoard';
import DutyAdmin from './DutyAdmin';

/**
 * Reiter „Dienste". Wer Dienstpläne verwalten darf, hat zusätzlich den
 * Reiter „Verwalten".
 *
 * @param {{ tab: string|null, onTabChange: (key:string) => void }} props
 */
export default function DutiesSection({ tab, onTabChange }) {
  const { can } = useAuth();
  const canManage = can('duties.manage');

  const tabs = [
    { key: 'offen', label: 'Dienste' },
    ...(canManage ? [{ key: 'verwalten', label: 'Verwalten' }] : []),
  ];
  const active = tabs.some((entry) => entry.key === tab) ? tab : 'offen';

  return (
    <>
      {tabs.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Dienste">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active === entry.key}
              onClick={() => onTabChange(entry.key)}
              className={`tab ${active === entry.key ? 'tab--active' : ''}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      <div className={tabs.length > 1 ? 'mt-6' : ''}>
        {active === 'verwalten' ? <DutyAdmin /> : <DutyBoard />}
      </div>
    </>
  );
}
