// Betriebs-Kennzahlen der API: Requests, Antwortzeiten, Fehlerquote und
// Herkunft der Anfragen. Speist die Karten und Diagramme unter
// /admin -> System-Status.
//
// Bewusst KOMPLETT IM ARBEITSSPEICHER und mit fester Obergrenze:
//
//   * Kein Schreibzugriff auf die Datenbank im Hot Path. Jeder Request würde
//     sonst ein INSERT auslösen – bei einer Vereins-App ist das reine
//     Verschwendung, und ein hängender DB-Server würde die API mitreissen.
//   * Die Daten sind Betriebsdaten, keine Geschäftsdaten. Nach einem Neustart
//     dürfen sie weg sein; das Dashboard weist die Laufzeit des Fensters aus.
//   * Speicherverbrauch ist nach oben hart begrenzt (siehe WINDOW_MINUTES und
//     MAX_COUNTRIES) – ein Lastangriff kann den Prozess darüber nicht
//     aufblähen.
//
// Datenschutz: es werden KEINE IP-Adressen, Konten oder Pfade mit Parametern
// gespeichert. Nur Zähler je Minute, je Statusklasse und je Ländercode.

const { countryOf, countryLabel, UNKNOWN } = require('../utils/geo');

// Beobachtungsfenster für den Requests-pro-Minute-Verlauf: 60 Einträge à
// 1 Minute. Der Ringpuffer belegt konstant ~60 kleine Objekte.
const WINDOW_MINUTES = 60;
const MINUTE_MS = 60 * 1000;

// Obergrenze der Länder-Tabelle. Ohne sie könnte ein verteilter Zugriff aus
// vielen Ländern die Map beliebig wachsen lassen. 250 deckt jedes existierende
// Land ab – mehr kann es nach ISO 3166 nicht geben.
const MAX_COUNTRIES = 250;

// Für die Perzentil-Berechnung wird eine begrenzte Stichprobe der letzten
// Antwortzeiten gehalten (Ringpuffer). Ein exaktes Perzentil bräuchte alle
// Werte – die Stichprobe ist für ein Dashboard genau genug und konstant groß.
const LATENCY_SAMPLE_SIZE = 500;

// Langsamer als das gilt als "träge" und wird getrennt ausgewiesen.
const SLOW_REQUEST_MS = 1000;

/** Leerer Minuten-Eimer. */
function emptyBucket(minute) {
  return { minute, requests: 0, errors: 0, durationSum: 0 };
}

const startedAt = Date.now();

// --- Zustand ---------------------------------------------------------------

const totals = {
  requests: 0,
  durationSum: 0,
  maxDuration: 0,
  slowRequests: 0,
  // Zähler je HTTP-Statusklasse (2xx/3xx/4xx/5xx).
  status: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 },
};

/** @type {Map<string, number>} Ländercode -> Anzahl Requests */
const countries = new Map();

/** @type {Map<string, {requests:number, durationSum:number, errors:number}>} */
const routes = new Map();
const MAX_ROUTES = 50;

/** @type {Array<{minute:number, requests:number, errors:number, durationSum:number}>} */
let buckets = [emptyBucket(currentMinute())];

/** @type {number[]} Ringpuffer der letzten Antwortzeiten */
const latencySample = [];
let latencyCursor = 0;

function currentMinute() {
  return Math.floor(Date.now() / MINUTE_MS);
}

/**
 * Hebt den Ringpuffer auf die aktuelle Minute an und füllt übersprungene
 * Minuten mit Nullen auf – sonst hätte ein ruhiger Server Lücken im Diagramm
 * statt sichtbarer Ruhe.
 */
function rollBuckets() {
  const now = currentMinute();
  const last = buckets[buckets.length - 1];
  if (last.minute === now) return;

  // Bei einer langen Pause nicht Minute für Minute nachziehen.
  const missing = Math.min(now - last.minute, WINDOW_MINUTES);
  for (let i = missing; i >= 1; i -= 1) {
    buckets.push(emptyBucket(now - i + 1));
  }
  if (buckets.length > WINDOW_MINUTES) {
    buckets = buckets.slice(-WINDOW_MINUTES);
  }
}

/** Statusklasse als Schlüssel: 404 -> '4xx'. */
function statusClass(statusCode) {
  if (!Number.isInteger(statusCode)) return 'other';
  const group = Math.floor(statusCode / 100);
  return group >= 2 && group <= 5 ? `${group}xx` : 'other';
}

/**
 * Einen abgeschlossenen Request verbuchen.
 *
 * @param {object} entry
 * @param {number} entry.statusCode
 * @param {number} entry.durationMs
 * @param {string} entry.country   Ländercode aus utils/geo
 * @param {string} [entry.route]   Grobe Route ohne Parameter, z. B. '/api/admin'
 */
function record({ statusCode, durationMs, country, route }) {
  rollBuckets();

  const bucket = buckets[buckets.length - 1];
  const isError = statusCode >= 400;

  bucket.requests += 1;
  bucket.durationSum += durationMs;
  if (isError) bucket.errors += 1;

  totals.requests += 1;
  totals.durationSum += durationMs;
  if (durationMs > totals.maxDuration) totals.maxDuration = durationMs;
  if (durationMs >= SLOW_REQUEST_MS) totals.slowRequests += 1;

  const klass = statusClass(statusCode);
  totals.status[klass] = (totals.status[klass] ?? 0) + 1;

  // Länder – nur zählen, solange die Tabelle nicht übervoll ist. Danach
  // landen weitere Codes gesammelt unter "Unbekannt", statt den Speicher
  // wachsen zu lassen.
  const code =
    countries.has(country) || countries.size < MAX_COUNTRIES ? country : UNKNOWN;
  countries.set(code, (countries.get(code) ?? 0) + 1);

  if (route) {
    const known = routes.get(route);
    if (known) {
      known.requests += 1;
      known.durationSum += durationMs;
      if (isError) known.errors += 1;
    } else if (routes.size < MAX_ROUTES) {
      routes.set(route, { requests: 1, durationSum: durationMs, errors: isError ? 1 : 0 });
    }
  }

  // Antwortzeit-Stichprobe (Ringpuffer fester Größe).
  if (latencySample.length < LATENCY_SAMPLE_SIZE) {
    latencySample.push(durationMs);
  } else {
    latencySample[latencyCursor] = durationMs;
    latencyCursor = (latencyCursor + 1) % LATENCY_SAMPLE_SIZE;
  }
}

/** Perzentil aus der Stichprobe (nearest-rank). 0, wenn nichts vorliegt. */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Alle Kennzahlen für das Dashboard.
 *
 * @returns {{
 *   collectedSince: string,
 *   totals: object,
 *   perMinute: {minute:string, requests:number, errors:number, avgMs:number}[],
 *   statusClasses: {klass:string, count:number, share:number}[],
 *   countries: {code:string, label:string, requests:number, share:number}[],
 *   routes: {route:string, requests:number, avgMs:number, errors:number}[]
 * }}
 */
function snapshot() {
  rollBuckets();

  const requests = totals.requests;
  const errors = (totals.status['4xx'] ?? 0) + (totals.status['5xx'] ?? 0);

  const perMinute = buckets.map((bucket) => ({
    // ISO-Zeitstempel des Minutenbeginns – das Frontend formatiert selbst.
    minute: new Date(bucket.minute * MINUTE_MS).toISOString(),
    requests: bucket.requests,
    errors: bucket.errors,
    avgMs: bucket.requests > 0 ? round(bucket.durationSum / bucket.requests) : 0,
  }));

  const statusClasses = Object.entries(totals.status)
    .filter(([, count]) => count > 0)
    .map(([klass, count]) => ({
      klass,
      count,
      share: requests > 0 ? round((count / requests) * 100) : 0,
    }));

  const countryRows = [...countries.entries()]
    .map(([code, count]) => ({
      code,
      label: countryLabel(code),
      requests: count,
      share: requests > 0 ? round((count / requests) * 100) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  const routeRows = [...routes.entries()]
    .map(([route, data]) => ({
      route,
      requests: data.requests,
      avgMs: round(data.durationSum / data.requests),
      errors: data.errors,
    }))
    .sort((a, b) => b.requests - a.requests);

  // Requests/Minute über die letzten 15 Minuten – aussagekräftiger als der
  // Durchschnitt seit dem Start, aber ruhiger als der letzte Einzelwert.
  const recent = buckets.slice(-15);
  const recentRequests = recent.reduce((sum, bucket) => sum + bucket.requests, 0);

  return {
    collectedSince: new Date(startedAt).toISOString(),
    windowMinutes: WINDOW_MINUTES,
    totals: {
      requests,
      errors,
      errorRate: requests > 0 ? round((errors / requests) * 100, 2) : 0,
      avgMs: requests > 0 ? round(totals.durationSum / requests) : 0,
      p95Ms: round(percentile(latencySample, 95)),
      maxMs: round(totals.maxDuration),
      slowRequests: totals.slowRequests,
      requestsPerMinute: recent.length > 0 ? round(recentRequests / recent.length) : 0,
    },
    perMinute,
    statusClasses,
    countries: countryRows,
    routes: routeRows,
  };
}

/** Setzt alle Zähler zurück (Tests, bewusster Neustart des Fensters). */
function reset() {
  totals.requests = 0;
  totals.durationSum = 0;
  totals.maxDuration = 0;
  totals.slowRequests = 0;
  for (const key of Object.keys(totals.status)) totals.status[key] = 0;
  countries.clear();
  routes.clear();
  buckets = [emptyBucket(currentMinute())];
  latencySample.length = 0;
  latencyCursor = 0;
}

module.exports = {
  WINDOW_MINUTES,
  SLOW_REQUEST_MS,
  record,
  snapshot,
  reset,
  countryOf,
};
