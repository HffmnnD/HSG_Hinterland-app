import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Database,
  Globe2,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import {
  formatBytes,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMs,
  formatNumber,
  formatPercent,
} from '../../lib/format';
import StatCard from './ui/StatCard';
import TrafficChart from './charts/TrafficChart';
import LatencyChart from './charts/LatencyChart';
import CountryChart from './charts/CountryChart';
import StatusBreakdown from './charts/StatusBreakdown';
import { ErrorNote, Loading, SuccessNote } from './ui/Feedback';

const PLATFORM_LABELS = {
  win32: 'Windows',
  linux: 'Linux',
  darwin: 'macOS',
};

/**
 * System-Status: Hardware, API-Verkehr und Datenbank auf einen Blick.
 *
 * Aufbau nach Dringlichkeit von oben nach unten:
 *   1. Hardware-Messer  – „läuft der Server am Anschlag?"
 *   2. API-Kennzahlen   – „kommt die App bei den Leuten an?"
 *   3. Diagramme        – „seit wann, und wie schlimm?"
 *   4. Herkunft & Details
 *
 * Die Werte kommen aus /api/admin/system und frischen sich alle 15 Sekunden
 * von selbst auf (siehe hooks/useSystemStatus.js).
 */
export default function SystemSection() {
  const { status, loading, refreshing, error, setError, reload, refreshSeconds } =
    useSystemStatus();
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);

  /** Wartungsaktion ausführen und danach den Status neu holen. */
  const runAction = async (key, path) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch(path, { method: 'POST' });
      await reload();
      setNotice(result?.message ?? 'Erledigt.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading>System-Status wird gelesen …</Loading>;

  if (!status) {
    return <ErrorNote>{error ?? 'System-Status konnte nicht gelesen werden.'}</ErrorNote>;
  }

  const { host, cpu, memory, disk, uploads, database, api, handballCache } = status;
  const totals = api.totals;

  // Die Fehlerquote bekommt ab 5 % eine Warnfarbe. Darunter ist sie in einer
  // Vereins-App normal: jedes abgelaufene Login-Cookie zählt als 401.
  const errorTone = totals.errorRate >= 5 ? 'warn' : 'ok';

  return (
    <div className="space-y-5">
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* ------------------------------------------------------- Hardware */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title text-base">Hardware</h2>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <RefreshCw
              size={12}
              aria-hidden="true"
              className={refreshing ? 'animate-spin' : ''}
            />
            Aktualisiert alle {refreshSeconds} Sekunden · Stand{' '}
            {formatDateTime(status.generatedAt)}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            icon={Cpu}
            label="CPU-Last"
            value={formatPercent(cpu.usagePercent)}
            percent={cpu.usagePercent}
            hint={`${formatCount(cpu.cores, 'Kern', 'Kerne')} · Mittel der letzten ${formatCount(
              Math.round(cpu.sampleSeconds),
              'Sekunde',
              'Sekunden'
            )}`}
          />

          <StatCard
            icon={MemoryStick}
            label="Arbeitsspeicher"
            value={formatPercent(memory.usedPercent)}
            percent={memory.usedPercent}
            hint={`${formatBytes(memory.usedBytes)} von ${formatBytes(
              memory.totalBytes
            )} belegt · App selbst ${formatBytes(memory.process.rssBytes)}`}
          />

          {disk.available ? (
            <StatCard
              icon={HardDrive}
              label="Speicherplatz"
              value={formatBytes(disk.freeBytes)}
              percent={disk.usedPercent}
              hint={`frei von ${formatBytes(disk.totalBytes)} · ${formatPercent(
                disk.usedPercent
              )} belegt`}
            />
          ) : (
            <StatCard
              icon={HardDrive}
              label="Speicherplatz"
              value="—"
              hint={disk.reason}
            />
          )}

          <StatCard
            icon={Clock}
            label="Uptime"
            value={formatDuration(host.processUptimeSeconds)}
            hint={`App seit ${formatDateTime(host.startedAt)} · System ${formatDuration(
              host.systemUptimeSeconds
            )}`}
          />
        </div>
      </section>

      {/* -------------------------------------------------- API-Kennzahlen */}
      <section>
        <h2 className="section-title text-base">API</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Beobachtungsfenster seit {formatDateTime(api.collectedSince)} · Verlauf
          der letzten {api.windowMinutes} Minuten.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            icon={Activity}
            label="Anfragen / Minute"
            value={formatNumber(totals.requestsPerMinute)}
            hint={`${formatNumber(totals.requests)} Anfragen insgesamt`}
          />
          <StatCard
            icon={Timer}
            label="Ø Antwortzeit"
            value={formatMs(totals.avgMs)}
            hint={`95 % unter ${formatMs(totals.p95Ms)} · langsamste ${formatMs(
              totals.maxMs
            )}`}
          />
          <StatCard
            icon={errorTone === 'warn' ? AlertTriangle : Zap}
            label="Fehlerquote"
            value={formatPercent(totals.errorRate, 2)}
            hint={`${formatNumber(totals.errors)} Antworten mit 4xx oder 5xx`}
          />
          <StatCard
            icon={Database}
            label="Datenbank"
            value={database.online ? formatMs(database.latencyMs) : 'Offline'}
            hint={
              database.online
                ? `${database.connections.free ?? '?'} von ${
                    database.connections.limit ?? '?'
                  } Verbindungen frei`
                : `Nicht erreichbar (${database.error})`
            }
          />
        </div>
      </section>

      {/* ------------------------------------------------------ Diagramme */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="admin-card">
          <div className="admin-card__header">
            <h3 className="section-title text-base">Anfragen und Fehler</h3>
            <span className="eyebrow">je Minute</span>
          </div>
          <div className="admin-card__body">
            <TrafficChart data={api.perMinute} />
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__header">
            <h3 className="section-title text-base">Antwortzeit</h3>
            <span className="eyebrow">Durchschnitt je Minute</span>
          </div>
          <div className="admin-card__body">
            <LatencyChart data={api.perMinute} />

            <h4 className="eyebrow mt-5">HTTP-Statusklassen</h4>
            <div className="mt-3">
              <StatusBreakdown statusClasses={api.statusClasses} />
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Herkunft */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="admin-card">
          <div className="admin-card__header">
            <h3 className="section-title flex items-center gap-2 text-base">
              <Globe2 size={16} aria-hidden="true" className="text-ink-muted" />
              Herkunft der Anfragen
            </h3>
            <span className="eyebrow">
              {formatCount(api.countries.length, 'Herkunft', 'Herkünfte')}
            </span>
          </div>
          <div className="admin-card__body">
            {api.countries.length === 0 ? (
              <p className="py-4 text-sm text-ink-muted">
                Noch keine Anfragen im Beobachtungsfenster.
              </p>
            ) : (
              <CountryChart countries={api.countries} />
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card__header">
            <h3 className="section-title text-base">Meistgenutzte Bereiche</h3>
            <span className="eyebrow">seit Start</span>
          </div>
          <div className="admin-card__body">
            {api.routes.length === 0 ? (
              <p className="py-4 text-sm text-ink-muted">Noch keine Anfragen erfasst.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="data-table data-table-compact">
                  <thead>
                    <tr>
                      <th>Bereich</th>
                      <th className="text-right">Anfragen</th>
                      <th className="text-right">Ø Zeit</th>
                      <th className="text-right">Fehler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {api.routes.slice(0, 8).map((route) => (
                      <tr key={route.route}>
                        <td className="font-semibold text-ink">{route.route}</td>
                        <td className="text-right tabular-nums">
                          {formatNumber(route.requests)}
                        </td>
                        <td className="text-right tabular-nums">{formatMs(route.avgMs)}</td>
                        <td className="text-right tabular-nums">
                          {route.errors > 0 ? (
                            <span className="font-bold text-danger">
                              {formatNumber(route.errors)}
                            </span>
                          ) : (
                            <span className="text-ink-muted">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------- Server & Wartung */}
      <section className="admin-card">
        <div className="admin-card__header">
          <h3 className="section-title text-base">Server</h3>
          <span className="badge badge-neutral">
            {host.environment === 'production' ? 'Produktion' : 'Entwicklung'}
          </span>
        </div>

        <div className="admin-card__body space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <Detail icon={Server} label="Host" value={host.hostname} />
            <Detail
              label="Betriebssystem"
              value={`${PLATFORM_LABELS[host.platform] ?? host.platform} ${host.release} (${host.arch})`}
            />
            <Detail label="Node" value={host.nodeVersion} />
            <Detail label="Prozessor" value={cpu.model ?? '—'} />
            <Detail
              label="Uploads"
              value={`${formatCount(uploads.files, 'Datei', 'Dateien')} · ${formatBytes(
                uploads.bytes
              )}`}
            />
            <Detail
              label="nuLiga-Cache"
              value={`${formatCount(
                handballCache.fresh.keys,
                'Eintrag',
                'Einträge'
              )} · ${formatNumber(handballCache.fresh.hits ?? 0)} Treffer / ${formatNumber(
                handballCache.fresh.misses ?? 0
              )} Fehlgriffe`}
            />
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => reload()}
              disabled={Boolean(busy)}
              className="btn btn-outline btn-sm"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Jetzt aktualisieren
            </button>

            <button
              type="button"
              onClick={() =>
                runAction('cache', '/api/admin/system/handball-cache/clear')
              }
              disabled={Boolean(busy)}
              className="btn btn-outline btn-sm"
              title="Tabellen, Spielpläne und Ticker beim nächsten Aufruf frisch von nuLiga holen."
            >
              <Trash2 size={14} aria-hidden="true" />
              {busy === 'cache' ? 'Wird geleert …' : 'nuLiga-Cache leeren'}
            </button>

            <button
              type="button"
              onClick={() => runAction('metrics', '/api/admin/system/metrics/reset')}
              disabled={Boolean(busy)}
              className="btn btn-danger btn-sm"
              title="Setzt Zähler, Antwortzeiten und Länderstatistik auf null zurück."
            >
              <RefreshCw size={14} aria-hidden="true" />
              {busy === 'metrics' ? 'Wird zurückgesetzt …' : 'Statistik zurücksetzen'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Eine Zeile der Server-Details. */
function Detail({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
        {Icon && <Icon size={12} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="truncate font-semibold text-ink" title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

