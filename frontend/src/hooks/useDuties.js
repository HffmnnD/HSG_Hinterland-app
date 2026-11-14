import { useApiResource } from './useSchedule';

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

const selectDuties = (result) => ({
  plans: result?.plans ?? [],
  categories: result?.categories ?? [],
});
const EMPTY = { plans: [], categories: [] };

/** Veröffentlichte Dienste, nach Plan gruppiert. Ohne Zeitraum: ab jetzt. */
export function useDuties({ from = null, to = null } = {}) {
  const { data, loading, error, reload } = useApiResource(
    `/api/duties${query({ from, to })}`,
    selectDuties,
    EMPTY
  );
  return { ...data, loading, error, reload };
}

const selectPlans = (result) => ({
  plans: result?.plans ?? [],
  categories: result?.categories ?? [],
  maxCapacity: result?.maxCapacity ?? 50,
});
const EMPTY_PLANS = { plans: [], categories: [], maxCapacity: 50 };

/** Alle Dienstpläne für die Verwaltung (Admin/Sub-Admin). */
export function useDutyPlans({ past = false, enabled = true } = {}) {
  const { data, loading, error, reload } = useApiResource(
    enabled ? `/api/duties/plans${query({ past: past ? 1 : null })}` : null,
    selectPlans,
    EMPTY_PLANS
  );
  return { ...data, loading, error, reload };
}

const selectPlan = (result) => result?.plan ?? null;

/** Ein Dienstplan mit allen Diensten und Eingetragenen (Verwaltung). */
export function useDutyPlan(planId) {
  const { data, loading, error, reload } = useApiResource(
    planId ? `/api/duties/plans/${planId}` : null,
    selectPlan,
    null
  );
  return { plan: data, loading, error, reload };
}
