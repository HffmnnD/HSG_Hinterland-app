// Einheitliche Datumsformate für die gesamte Oberfläche (deutsch).

/**
 * Kurzes Datum, z. B. „8.9.2026". Gibt „—" zurück, wenn nichts vorliegt.
 * @param {string|Date|null|undefined} value
 */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('de-DE');
}

/**
 * Datum mit Uhrzeit, z. B. „8. September 2026, 21:25".
 * @param {string|Date|null|undefined} value
 */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
