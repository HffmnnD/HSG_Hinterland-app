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

// --------------------------------------------------------- Zahlen & Größen

/** Ganze Zahl mit Tausenderpunkten, z. B. 1284 -> „1.284". */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('de-DE');
}

/**
 * Datenmenge in der passenden Einheit, z. B. 15430930432 -> „14,4 GB".
 * Basis 1024 (wie Betriebssysteme rechnen), eine Nachkommastelle ab MB.
 */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Bytes und Kilobytes ohne Nachkommastelle – „1,0 KB" liest sich albern.
  const digits = unit <= 1 ? 0 : 1;
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[unit]}`;
}

/**
 * Laufzeit aus Sekunden, z. B. 267845 -> „3 T 2 Std". Zeigt immer nur die
 * zwei größten Einheiten – „3 T 2 Std 17 Min 25 Sek" liest niemand.
 */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days} T ${hours} Std`;
  if (hours > 0) return `${hours} Std ${minutes} Min`;
  if (minutes > 0) return `${minutes} Min ${secs} Sek`;
  return `${secs} Sek`;
}

/** Antwortzeit in Millisekunden, z. B. 4.8 -> „4,8 ms". */
export function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  return `${number.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ms`;
}

/** Prozentwert, z. B. 62.9 -> „62,9 %". */
export function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} %`;
}

/**
 * Zahl mit passender Ein-/Mehrzahl, z. B. (1, 'Datei', 'Dateien') -> „1 Datei".
 * Deutsch bildet den Plural zu unregelmäßig für eine Regel – deshalb werden
 * beide Formen übergeben.
 */
export function formatCount(value, singular, plural) {
  const number = Number(value) || 0;
  return `${formatNumber(number)} ${number === 1 ? singular : plural}`;
}

/** Nur die Uhrzeit, z. B. „14:07" – für die Achse des Minuten-Diagramms. */
export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
