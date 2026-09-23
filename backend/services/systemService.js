// Hardware- und Prozess-Kennzahlen des Servers für /admin -> System-Status.
//
// Alles kommt aus Node-Bordmitteln (`os`, `fs`, `process`) – keine zusätzliche
// Abhängigkeit, kein Shell-Aufruf. Läuft damit unter Windows (Entwicklung per
// XAMPP) genauso wie unter Linux (Produktion).
//
// Zur CPU-Last: `os.loadavg()` gibt es unter Windows nicht (liefert dort immer
// [0,0,0]). Deshalb wird die Auslastung plattformunabhängig aus der Differenz
// zweier `os.cpus()`-Messungen berechnet: die Tick-Zähler jedes Kerns wachsen
// monoton, ihre Differenz über ein Zeitfenster ergibt den Anteil der Zeit, den
// die CPU nicht im Leerlauf war.
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { UPLOAD_ROOT } = require('../config/uploads');

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percent = (used, total) => (total > 0 ? round((used / total) * 100) : 0);

// Referenzmessung für die CPU-Auslastung. Wird beim Laden des Moduls gesetzt
// und bei jedem Abruf fortgeschrieben – der erste Abruf nach dem Start deckt
// also die Zeit seit dem Start ab, jeder weitere die Zeit seit dem letzten
// Abruf. Das ist genau das, was ein Monitoring zeigen soll.
let lastCpuSample = sampleCpu();

// Zuletzt berechnete Auslastung. Nötig, weil zwei Abrufe kurz hintereinander
// vorkommen (React lädt im Entwicklungsmodus jeden Effekt doppelt, und wer
// „Jetzt aktualisieren" drückt, während der Timer feuert, löst zwei aus).
// Würde die Referenz dabei jedes Mal fortgeschrieben, bliebe für den zweiten
// Abruf ein Fenster von wenigen Millisekunden – und der zeigt dann 0 %, weil
// in dieser Zeit schlicht kein Tick vergangen ist.
let lastCpuUsage = { usagePercent: 0, sampleSeconds: 0 };

// Kürzere Fenster als das sind nicht aussagekräftig: die Tick-Zähler des
// Betriebssystems werden nur alle paar Millisekunden fortgeschrieben.
const MIN_CPU_SAMPLE_MS = 500;

/** Summiert die Tick-Zähler aller Kerne. */
function sampleCpu() {
  const cpus = os.cpus() ?? [];
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    for (const [mode, ticks] of Object.entries(cpu.times)) {
      total += ticks;
      if (mode === 'idle') idle += ticks;
    }
  }
  return { idle, total, at: Date.now() };
}

/**
 * CPU-Auslastung in Prozent seit der letzten Messung.
 * @returns {{ usagePercent:number, sampleSeconds:number, cores:number, model:string|null }}
 */
function cpuUsage() {
  const cpus = os.cpus() ?? [];
  const statics = {
    cores: cpus.length,
    model: cpus[0]?.model?.trim() ?? null,
    // loadavg nur dort ausweisen, wo es echte Werte liefert.
    loadAverage: os.platform() === 'win32' ? null : os.loadavg().map((v) => round(v, 2)),
  };

  const current = sampleCpu();
  const elapsedMs = current.at - lastCpuSample.at;

  // Zu kurzes Fenster: den letzten belastbaren Wert weiterreichen und die
  // Referenz NICHT anfassen, damit der nächste Abruf wieder ein
  // aussagekräftiges Fenster vorfindet.
  if (elapsedMs < MIN_CPU_SAMPLE_MS) {
    return { ...lastCpuUsage, ...statics };
  }

  const idleDelta = current.idle - lastCpuSample.idle;
  const totalDelta = current.total - lastCpuSample.total;
  lastCpuSample = current;

  // totalDelta <= 0 wäre ein übergelaufener oder zurückgesetzter Zähler –
  // dann lieber den alten Wert behalten als eine 0 zu behaupten.
  if (totalDelta <= 0) {
    return { ...lastCpuUsage, ...statics };
  }

  lastCpuUsage = {
    usagePercent: round(((totalDelta - idleDelta) / totalDelta) * 100),
    sampleSeconds: round(elapsedMs / 1000),
  };
  return { ...lastCpuUsage, ...statics };
}

/** Arbeitsspeicher des Systems und des Node-Prozesses. */
function memoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const process_ = process.memoryUsage();

  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    usedPercent: percent(used, total),
    // Was der Node-Prozess selbst belegt – wichtiger als der Systemwert, wenn
    // der Server mit anderen Diensten geteilt wird.
    process: {
      rssBytes: process_.rss,
      heapUsedBytes: process_.heapUsed,
      heapTotalBytes: process_.heapTotal,
      externalBytes: process_.external,
    },
  };
}

/**
 * Freier Plattenplatz des Dateisystems, auf dem die Anwendung liegt.
 *
 * `fs.statfs` gibt es seit Node 18.15 auf allen Plattformen. Fehlt es (oder
 * scheitert der Aufruf, z. B. bei einem Netzlaufwerk ohne Rechte), wird
 * `available: false` gemeldet – die Oberfläche zeigt dann einen Hinweis statt
 * einer erfundenen Zahl.
 */
async function diskUsage() {
  const target = path.join(__dirname, '..');

  if (typeof fs.statfs !== 'function') {
    return {
      available: false,
      reason: 'fs.statfs wird von dieser Node-Version nicht unterstützt (benötigt Node 18.15+).',
    };
  }

  try {
    const stats = await fs.statfs(target);
    // bsize = Blockgröße, blocks = Gesamtzahl, bavail = für nicht-privilegierte
    // Nutzer verfügbar (kleiner als bfree – Linux reserviert 5 % für root).
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = total - free;

    return {
      available: true,
      path: target,
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      usedPercent: percent(used, total),
    };
  } catch (err) {
    return {
      available: false,
      reason: `Plattenplatz nicht lesbar (${err.code || err.message}).`,
    };
  }
}

/**
 * Belegung des Upload-Verzeichnisses (Beitragsbilder, Mannschaftsfotos).
 * Rekursiv, aber flach genug – dort liegen nur zwei Unterordner.
 */
async function uploadsUsage() {
  let files = 0;
  let bytes = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Verzeichnis existiert noch nicht (frische Installation).
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          files += 1;
          bytes += stat.size;
        } catch {
          // Datei wurde zwischen readdir und stat gelöscht – überspringen.
        }
      }
    }
  }

  await walk(UPLOAD_ROOT);
  return { files, bytes };
}

/** Betriebssystem, Laufzeiten, Node-Version. */
function hostInfo() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    nodeVersion: process.version,
    // Sekunden – das Frontend formatiert daraus "3 T 4 Std".
    systemUptimeSeconds: Math.floor(os.uptime()),
    processUptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Vollständiger Hardware-Bericht.
 * @returns {Promise<object>}
 */
async function collect() {
  const [disk, uploads] = await Promise.all([diskUsage(), uploadsUsage()]);
  return {
    host: hostInfo(),
    cpu: cpuUsage(),
    memory: memoryUsage(),
    disk,
    uploads,
  };
}

module.exports = { collect, cpuUsage, memoryUsage, diskUsage, uploadsUsage, hostInfo };
