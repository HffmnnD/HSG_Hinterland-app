// Erfasst jeden abgeschlossenen Request für die Betriebs-Statistik
// (services/metricsService.js). Wird ganz vorne in server.js eingehängt,
// damit auch abgelehnte Anfragen (403 CORS/Origin, 404, 429) mitgezählt
// werden – gerade die sind für ein Monitoring interessant.
const metricsService = require('../services/metricsService');
const { countryOf } = require('../utils/geo');

// Auf diese Tiefe werden Pfade für die Routen-Statistik gekürzt. So entstehen
// stabile Gruppen ('/api/teams') statt einer Zeile je Mannschaft oder ID –
// und die Statistik enthält keine potenziell personenbezogenen Pfadteile.
const ROUTE_DEPTH = 2;

/**
 * Erwartete Nicht-2xx-Antwort, die KEIN Betriebsfehler ist: Die App fragt beim
 * Laden `GET /api/auth/me`, um zu sehen, ob eine Sitzung besteht. Ohne
 * Anmeldung ist die Antwort 401 – gewollt, kein Fehler. Sonst würde jeder
 * Seitenaufruf vor dem Login die Fehlerquote im Dashboard hochtreiben.
 */
function isExpectedResponse(method, path, statusCode) {
  const clean = String(path || '').split('?')[0].replace(/\/+$/, '');
  return method === 'GET' && clean === '/api/auth/me' && (statusCode === 401 || statusCode === 403);
}

/**
 * Grobe Routengruppe eines Pfades.
 *   '/api/teams/MJC/members/42' -> '/api/teams'
 *   '/api/uploads/news/a1b2.jpg' -> '/api/uploads'
 */
function routeGroup(path) {
  const segments = String(path || '/')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .slice(0, ROUTE_DEPTH);
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

function metricsMiddleware(req, res, next) {
  // process.hrtime.bigint() ist monoton – anders als Date.now() springt es
  // nicht, wenn die Systemuhr nachgestellt wird.
  const start = process.hrtime.bigint();

  // 'finish' feuert, sobald die Antwort raus ist. 'close' fängt zusätzlich den
  // Fall ab, dass der Client vorher auflegt – sonst würden abgebrochene
  // Requests nie gezählt. `once` je Ereignis plus das Flag stellen sicher,
  // dass genau EIN Eintrag entsteht.
  let recorded = false;
  const finish = () => {
    if (recorded) return;
    recorded = true;

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const url = req.originalUrl ?? req.url;
    metricsService.record({
      statusCode: res.statusCode,
      durationMs,
      country: countryOf(req),
      route: routeGroup(url),
      expected: isExpectedResponse(req.method, url, res.statusCode),
    });
  };

  res.once('finish', finish);
  res.once('close', finish);

  return next();
}

module.exports = { metricsMiddleware, routeGroup, isExpectedResponse };
