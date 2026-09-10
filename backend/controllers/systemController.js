// System-Status für die Verwaltung (/api/admin/system).
//
// Kein SQL und keine Messlogik in dieser Datei – die Zahlen liefern
// services/systemService.js (Hardware) und services/metricsService.js
// (Requests, Antwortzeiten, Herkunft). Hier steht nur, was davon in EINER
// Antwort zusammengefasst wird.
//
// Berechtigung: nur `admin` und `sub_admin` (durchgesetzt in adminRoutes.js).
// Betriebsdaten verraten Hostname, Pfade und Auslastung – das gehört nicht in
// die Hände von Trainer:innen, die die Seite sonst ebenfalls erreichen.
const systemService = require('../services/systemService');
const metricsService = require('../services/metricsService');
const handballService = require('../services/handballService');
const pool = require('../config/db');
const { COUNTRY_HEADERS } = require('../utils/geo');

/**
 * Zustand der Datenbank: erreichbar? wie schnell? wie voll ist der Pool?
 *
 * Der Ping ist ein `SELECT 1` – billiger geht es nicht, und er beweist mehr
 * als ein Blick auf die Pool-Zähler (die auch dann gut aussehen, wenn MySQL
 * still gestorben ist).
 */
async function databaseHealth() {
  const startedAt = process.hrtime.bigint();
  try {
    await pool.query('SELECT 1');
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Die Pool-Interna sind nicht Teil der öffentlichen mysql2-API, deshalb
    // defensiv auslesen: fehlen sie nach einem Update, bleibt der Rest heil.
    const internal = pool.pool ?? {};
    return {
      online: true,
      latencyMs: Math.round(latencyMs * 10) / 10,
      connections: {
        all: internal._allConnections?.length ?? null,
        free: internal._freeConnections?.length ?? null,
        queued: internal._connectionQueue?.length ?? null,
        limit: internal.config?.connectionLimit ?? null,
      },
    };
  } catch (err) {
    return { online: false, error: err.code || err.message };
  }
}

// GET /api/admin/system
//
// Eine Antwort für die ganze Seite: Hardware, API-Kennzahlen, Datenbank und
// der nuLiga-Cache. Vier getrennte Endpunkte wären vier Requests für ein
// Dashboard, das ohnehin alles gleichzeitig zeigt.
async function getSystemStatus(req, res, next) {
  try {
    const [hardware, database] = await Promise.all([
      systemService.collect(),
      databaseHealth(),
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      ...hardware,
      database,
      api: metricsService.snapshot(),
      // Trefferquote des Handball-Caches: zeigt, wie viele nuLiga-Abrufe
      // eingespart werden.
      handballCache: handballService.getCacheStats(),
      // Damit die Oberfläche erklären kann, warum die Länderstatistik ggf.
      // leer bleibt (siehe utils/geo.js).
      geoHeaders: COUNTRY_HEADERS,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/system/metrics/reset
//
// Setzt das Beobachtungsfenster der API-Statistik zurück. Praktisch nach
// einem Lasttest oder einem behobenen Fehler: die alte Fehlerquote soll die
// Anzeige nicht dauerhaft rot färben.
function resetMetrics(req, res) {
  metricsService.reset();
  return res.json({ message: 'Statistik zurückgesetzt.' });
}

// POST /api/admin/system/handball-cache/clear
//
// Leert den nuLiga-Cache. Nützlich, wenn der Verband eine Tabelle korrigiert
// hat und niemand 15 Minuten auf den nächsten Abruf warten will.
function clearHandballCache(req, res) {
  handballService.clearCache();
  return res.json({ message: 'Handball-Cache geleert.' });
}

module.exports = { getSystemStatus, resetMetrics, clearHandballCache };
