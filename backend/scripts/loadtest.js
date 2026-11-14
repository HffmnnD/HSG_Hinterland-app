// Härtetest: sehr viele Anfragen live gegen den echten Server.
//
//   npm run loadtest                     ~20.000, dann ~100.000 Anfragen
//   npm run loadtest -- --normal 50000   erste Runde größer
//   npm run loadtest -- --flood 200000   zweite Runde größer
//   npm run loadtest -- --burst 800      so viele gleichzeitig
//   npm run loadtest -- --keep           Testdatenbank behalten
//
// Zwei Runden:
//   1. „Normaler Ansturm": eine echte Mischung aus Lesen und Zusagen, wie
//      wenn nach einer Veröffentlichung alle gleichzeitig in die App gehen.
//      Gemessen werden Durchsatz (Anfragen je Sekunde) und Antwortzeiten.
//   2. „Angriff (DDoS-Richtung)": eine Flut aus falschen Logins, ungültigen
//      Sitzungen und Anfragen ohne Anmeldung, dazwischen ein paar echte
//      Nutzer:innen. Geprüft wird nicht, ob alles durchkommt (das soll es
//      nicht), sondern ob der Server stehen bleibt, sich wehrt (Bremse,
//      401/429) und echte Nutzer:innen noch bedient werden.
//
// Wie beim Stresstest: eigene Datenbank `<DB_NAME>_loadtest`, eigener Server
// auf Port 5098, am Ende wieder gelöscht. Die echte Datenbank bleibt unberührt.
require('dotenv').config({ quiet: true, path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// --- Einstellungen -----------------------------------------------------------

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? Number(args[index + 1]) : fallback;
};
const USERS = argValue('users', 5000);
const NORMAL = argValue('normal', 20000);
const FLOOD = argValue('flood', 100000);
// Windows weist bei sehr vielen gleichzeitigen Verbindungen einen Teil ab.
const BURST = argValue('burst', process.platform === 'win32' ? 400 : 800);
const KEEP = args.includes('--keep');
const PORT = argValue('port', 5098);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'Lasttest-123';

const BASE_DB = process.env.DB_NAME || 'hsg_hinterland';
const TEST_DB = `${BASE_DB}_loadtest`;
const BACKEND = path.join(__dirname, '..');
const REPORT = path.join(BACKEND, 'lasttest-ergebnis.md');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
};

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET fehlt in backend/.env.');
  process.exit(1);
}

// --- Hilfen ------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const sqlDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const daysFromNow = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toLocaleTimeString('de-DE'), ...parts);

const tokenCache = new Map();
function tokenFor(id, role = 'spieler') {
  const key = `${id}:${role}`;
  if (!tokenCache.has(key)) {
    tokenCache.set(key, jwt.sign({ sub: id, role }, process.env.JWT_SECRET, { expiresIn: '3h' }));
  }
  return tokenCache.get(key);
}
// Ein formal gültiges, aber mit falschem Schlüssel signiertes Token: Der
// Server muss es ablehnen (401), ohne daran Arbeit zu verschwenden.
const FORGED = jwt.sign({ sub: 1, role: 'admin' }, 'falscher-schluessel', { expiresIn: '1h' });

/** Eine Anfrage, nur Status und Dauer. Wirft nie, behält keine Antwortkörper. */
async function call(method, url, { token, cookie, body, raw } = {}) {
  const started = performance.now();
  try {
    const headers = {};
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    if (raw) headers['Content-Type'] = 'application/json';
    const auth = cookie ?? (token ? `token=${token}` : null);
    if (auth) headers.Cookie = auth;
    const res = await fetch(BASE + url, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    // Körper lesen und verwerfen, damit die Verbindung frei wird.
    await res.arrayBuffer().catch(() => {});
    return { status: res.status, ms: performance.now() - started };
  } catch (err) {
    return { status: 0, ms: performance.now() - started, err: err.cause?.code ?? err.message };
  }
}

/** Aufgaben mit höchstens `limit` gleichzeitig. Sammelt nur knappe Ergebnisse. */
async function runLimited(tasks, limit = BURST) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function summarize(results, seconds) {
  const statuses = {};
  const errs = {};
  for (const r of results) {
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (r.err) errs[r.err] = (errs[r.err] ?? 0) + 1;
  }
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const at = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))] : 0);
  return {
    count: results.length,
    statuses,
    errs,
    throughput: seconds ? Math.round(results.length / seconds) : null,
    p50: Math.round(at(0.5)),
    p95: Math.round(at(0.95)),
    p99: Math.round(at(0.99)),
    max: Math.round(times[times.length - 1] ?? 0),
    server5xx: results.filter((r) => r.status >= 500).length,
    refused: results.filter((r) => r.status === 0).length,
  };
}

const rounds = [];
const failures = [];
function record(name, summary, checks) {
  for (const check of checks) if (!check.ok) failures.push(`${name}: ${check.label}`);
  rounds.push({ name, summary, checks });
  const ok = checks.every((c) => c.ok);
  log(
    `${ok ? 'OK  ' : 'FEHLER'} ${name}`,
    JSON.stringify(summary.statuses),
    `${summary.throughput ?? '?'}/s p95 ${summary.p95} ms`
  );
  for (const check of checks) log(`   ${check.ok ? '✓' : '✗'} ${check.label}`);
}

// --- Testdatenbank -----------------------------------------------------------

async function createDatabase() {
  if (!TEST_DB.endsWith('_loadtest')) throw new Error('Unerwarteter Datenbankname.');
  const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  const schema = fs
    .readFileSync(path.join(BACKEND, 'db', 'schema.sql'), 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS\s+\w+/i, `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\``)
    .replace(/^USE\s+\w+;/im, `USE \`${TEST_DB}\`;`);
  await conn.query(schema);
  await conn.end();

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(BACKEND, 'db', 'migrate.js')], {
      cwd: BACKEND,
      env: { ...process.env, DB_NAME: TEST_DB },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Migration fehlgeschlagen'))));
  });
}

async function dropDatabase() {
  if (!TEST_DB.endsWith('_loadtest')) return;
  const conn = await mysql.createConnection(dbConfig);
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.end();
}

async function seed(db) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const rows = [];
  for (let i = 0; i < USERS; i += 1) {
    rows.push([`Last${i}`, `Person${i}`, `load${i}@test.invalid`, hash, i < 1 ? 'admin' : 'spieler']);
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await db.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role, onboarding_completed_at) VALUES ' +
        rows.slice(i, i + 2000).map(() => '(?, ?, ?, ?, ?, NOW())').join(', '),
      rows.slice(i, i + 2000).flat()
    );
  }
  const [[{ firstId }]] = await db.query('SELECT MIN(id) AS firstId FROM users');
  const userIds = Array.from({ length: USERS }, (_, i) => firstId + i);
  const admin = userIds[0];
  const members = userIds.slice(1);

  // Mannschaften zu je ~50 Mitgliedern, damit Kalender und Events Inhalt haben.
  const teamCount = Math.max(1, Math.ceil(members.length / 50));
  const teamRows = Array.from({ length: teamCount }, (_, i) => [`LT${i}`, `Lasttest ${i}`, 'Senioren', 'male', 2000 + i]);
  await db.query('INSERT INTO teams (code, name, age_group, gender, sort_order) VALUES ?', [teamRows]);
  const [teams] = await db.query("SELECT id FROM teams WHERE code LIKE 'LT%' ORDER BY id");
  const teamIds = teams.map((t) => t.id);
  const memberships = members.map((userId, i) => [userId, teamIds[i % teamIds.length], 'player', 1]);
  for (let i = 0; i < memberships.length; i += 5000) {
    await db.query('INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed) VALUES ?', [
      memberships.slice(i, i + 5000),
    ]);
  }

  // Zwei Trainings je Woche über acht Wochen.
  const events = [];
  for (const teamId of teamIds) {
    for (let week = 0; week < 8; week += 1) {
      for (const offset of [1, 3]) {
        events.push([
          teamId, 'Training', 'REGULAR_TRAINING', 'Testhalle',
          sqlDate(daysFromNow(week * 7 + offset, 19)), sqlDate(daysFromNow(week * 7 + offset, 20, 30)), admin,
        ]);
      }
    }
  }
  for (let i = 0; i < events.length; i += 5000) {
    await db.query('INSERT INTO events (team_id, title, type, location, start_time, end_time, created_by) VALUES ?', [
      events.slice(i, i + 5000),
    ]);
  }

  // Ein großer Dienstplan mit vielen Diensten und reichlich Plätzen, damit die
  // Zusagen in der Lastrunde Platz finden und die Leseantwort ordentlich groß ist.
  const [plan] = await db.query(
    "INSERT INTO duty_plans (title, location, status, published_at, created_by) VALUES ('Lasttest-Plan', 'Testhalle', 'published', NOW(), ?)",
    [admin]
  );
  const duties = [];
  for (let d = 0; d < 400; d += 1) {
    const start = daysFromNow(12 + Math.floor(d / 20), 8, 0);
    start.setMinutes(start.getMinutes() + (d % 20) * 30);
    duties.push([plan.insertId, `Dienst ${d}`, sqlDate(start), sqlDate(new Date(start.getTime() + 30 * 60000)), 20]);
  }
  await db.query('INSERT INTO duties (plan_id, title, start_time, end_time, capacity) VALUES ?', [duties]);
  const [dutyRows] = await db.query('SELECT id FROM duties WHERE plan_id = ?', [plan.insertId]);

  return { admin, members, dutyIds: dutyRows.map((r) => r.id) };
}

// --- Server ------------------------------------------------------------------

function startServer(logLines) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: { ...process.env, DB_NAME: TEST_DB, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk) => logLines.push(...String(chunk).split('\n').filter(Boolean));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    if ((await call('GET', '/api/test')).status === 200) return;
    await sleep(500);
  }
  throw new Error('Backend startet nicht.');
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const timed = async (tasks) => {
  const started = performance.now();
  const results = await runLimited(tasks);
  return { results, seconds: (performance.now() - started) / 1000 };
};

// --- Runde 1: normaler Ansturm ----------------------------------------------

async function normalRound({ members, dutyIds }) {
  const tasks = [];
  for (let i = 0; i < NORMAL; i += 1) {
    const user = pick(members);
    const token = tokenFor(user);
    const r = Math.random();
    if (r < 0.45) tasks.push(() => call('GET', '/api/duties', { token }));
    else if (r < 0.7) tasks.push(() => call('GET', '/api/events?mine=1', { token }));
    else if (r < 0.85) tasks.push(() => call('GET', '/api/calendar/export.ics', { token }));
    else tasks.push(() => call('POST', `/api/duties/${pick(dutyIds)}/claim`, { token, body: { clientTime: new Date().toISOString() } }));
  }
  const { results, seconds } = await timed(tasks);
  const summary = summarize(results, seconds);
  record('1. Normaler Ansturm', summary, [
    { label: `keine Serverfehler (5xx: ${summary.server5xx})`, ok: summary.server5xx === 0 },
    {
      label: `so gut wie alles beantwortet (abgewiesen/abgebrochen: ${summary.refused})`,
      ok: summary.refused <= results.length * 0.01,
    },
  ]);
  return summary;
}

// --- Runde 2: Angriff (DDoS-Richtung) ---------------------------------------

async function floodRound({ members }) {
  const tasks = [];
  const legit = [];
  for (let i = 0; i < FLOOD; i += 1) {
    const r = Math.random();
    if (r < 0.4) {
      // Falsche Logins: nach 10 Fehlversuchen je IP greift die Bremse (429),
      // ohne dass der Server für jeden Versuch ein Passwort prüft.
      tasks.push(() =>
        call('POST', '/api/auth/login', { body: { email: `load${i % USERS}@test.invalid`, password: 'falsch' } })
      );
    } else if (r < 0.65) {
      // Gefälschte Sitzung: muss mit 401 abgewiesen werden.
      tasks.push(() => call('GET', '/api/duties', { token: FORGED }));
    } else if (r < 0.85) {
      // Ganz ohne Anmeldung auf geschützte Pfade.
      tasks.push(() => call('GET', pick(['/api/duties', '/api/events', '/api/auth/me'])));
    } else if (r < 0.95) {
      // Müll-Körper auf einen Schreibpfad, ohne gültige Sitzung.
      tasks.push(() =>
        call('POST', '/api/duties/1/claim', { cookie: 'token=kaputt', raw: '{"clientTime":"' + 'x'.repeat(200) + '"}' })
      );
    } else {
      // Echte Nutzer:innen mitten im Sturm: Werden sie noch bedient?
      const task = () => call('GET', '/api/duties', { token: tokenFor(pick(members)) });
      tasks.push(task);
      legit.push(tasks.length - 1);
    }
  }
  const { results, seconds } = await timed(tasks);
  const summary = summarize(results, seconds);
  const legitResults = legit.map((index) => results[index]);
  const legitOk = legitResults.filter((r) => r.status === 200).length;
  const legitSummary = summarize(legitResults);
  const blocked = (summary.statuses[401] ?? 0) + (summary.statuses[429] ?? 0);
  record('2. Angriff (DDoS-Richtung)', summary, [
    { label: `keine Serverfehler (5xx: ${summary.server5xx})`, ok: summary.server5xx === 0 },
    { label: `Angriff abgewehrt (401/429: ${blocked})`, ok: blocked > 0 },
    {
      label: `echte Nutzer:innen weiter bedient (${legitOk} von ${legitResults.length}, p95 ${legitSummary.p95} ms)`,
      ok: legitResults.length === 0 || legitOk >= legitResults.length * 0.9,
    },
  ]);
  return { summary, legitSummary, legitOk, legitCount: legitResults.length };
}

// --- Bericht -----------------------------------------------------------------

function statusLine(statuses) {
  return Object.entries(statuses)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, n]) => `${status === '0' ? 'abgebrochen' : status}: ${n.toLocaleString('de-DE')}`)
    .join(', ');
}

function writeReport(serverLog, normal, flood, durationMs) {
  const unhandled = serverLog.filter((line) => /Unbehandelter Fehler|uncaught|Unbehandelte Promise/i.test(line));
  const total = normal.count + flood.summary.count;
  const lines = [
    '# Lasttest-Ergebnis (Härtetest)',
    '',
    `Stand: ${new Date().toLocaleString('de-DE')} · ${USERS.toLocaleString('de-DE')} Konten · ${total.toLocaleString('de-DE')} Anfragen · bis zu ${BURST} gleichzeitig · Dauer ${Math.round(durationMs / 1000)} s`,
    `Rechner: ${process.platform} ${process.arch}, Node ${process.version}, ${require('os').cpus().length} Kerne, ${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)} GB RAM`,
    `Datenbank-Verbindungen des Backends: ${process.env.DB_CONNECTION_LIMIT || 10} (DB_CONNECTION_LIMIT)`,
    '',
    failures.length === 0
      ? '**Alle Prüfungen bestanden.**'
      : `**${failures.length} Prüfung(en) fehlgeschlagen:**\n\n${failures.map((f) => `- ${f}`).join('\n')}`,
    '',
    '## Runde 1 – Normaler Ansturm',
    '',
    `${normal.count.toLocaleString('de-DE')} Anfragen (Lesen der Dienste und des Kalenders, Kalender-Export, Zusagen), gemischt wie in der echten App.`,
    '',
    `- Durchsatz: **${normal.throughput?.toLocaleString('de-DE')} Anfragen/Sekunde**`,
    `- Antwortzeiten: Median ${normal.p50} ms, 95 % ${normal.p95} ms, 99 % ${normal.p99} ms, langsamste ${normal.max} ms`,
    `- Antworten: ${statusLine(normal.statuses)}`,
    `- Serverfehler (5xx): ${normal.server5xx} · abgewiesene Verbindungen: ${normal.refused}`,
    '',
    '## Runde 2 – Angriff (DDoS-Richtung)',
    '',
    `${flood.summary.count.toLocaleString('de-DE')} Anfragen: 40 % falsche Logins, 25 % gefälschte Sitzungen, 20 % ohne Anmeldung, 10 % Müll-Anfragen, 5 % echte Nutzer:innen mittendrin.`,
    '',
    `- Durchsatz: **${flood.summary.throughput?.toLocaleString('de-DE')} Anfragen/Sekunde**`,
    `- Antwortzeiten: Median ${flood.summary.p50} ms, 95 % ${flood.summary.p95} ms, 99 % ${flood.summary.p99} ms, langsamste ${flood.summary.max} ms`,
    `- Antworten: ${statusLine(flood.summary.statuses)}`,
    `- Serverfehler (5xx): ${flood.summary.server5xx} · abgewiesene Verbindungen: ${flood.summary.refused}`,
    `- Echte Nutzer:innen im Sturm: ${flood.legitOk} von ${flood.legitCount} beantwortet, 95 % in ${flood.legitSummary.p95} ms`,
    '',
    '## Was das heißt',
    '',
    '- 401 = ohne gültige Anmeldung abgewiesen. 429 = von der Bremse gestoppt (zu viele Versuche je Adresse). Beides ist gewollt.',
    '- „abgewiesene Verbindungen" zählt, was das Betriebssystem bei sehr vielen gleichzeitigen Verbindungen gar nicht erst annimmt. Kein Serverfehler, sondern eine Grenze des Rechners.',
    '- Entscheidend: keine Serverfehler (5xx), der Server bleibt stehen, und echte Nutzer:innen werden auch während des Angriffs bedient.',
    '',
    '## Server-Protokoll',
    '',
    `- Unbehandelte Fehler: ${unhandled.length}`,
    ...(unhandled.length ? ['', '```', ...unhandled.slice(0, 20), '```'] : []),
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  log('Bericht:', REPORT);
}

// --- Ablauf ------------------------------------------------------------------

(async () => {
  const startedAt = performance.now();
  const serverLog = [];
  let server = null;
  let db = null;
  try {
    log(`Testdatenbank ${TEST_DB} anlegen …`);
    await createDatabase();
    db = await mysql.createConnection({ ...dbConfig, database: TEST_DB });
    log(`${USERS.toLocaleString('de-DE')} Konten, Mannschaften, Trainings und einen großen Dienstplan anlegen …`);
    const data = await seed(db);

    log(`Backend auf Port ${PORT} starten …`);
    server = startServer(serverLog);
    await waitForServer();

    log(`Runde 1: ${NORMAL.toLocaleString('de-DE')} Anfragen (normaler Ansturm) …`);
    const normal = await normalRound(data);
    log(`Runde 2: ${FLOOD.toLocaleString('de-DE')} Anfragen (Angriff) …`);
    const flood = await floodRound(data);
    // Lebt der Server danach noch?
    const alive = (await call('GET', '/api/test')).status === 200;
    record('3. Server danach erreichbar', summarize([{ status: alive ? 200 : 0, ms: 0 }]), [
      { label: alive ? 'Server antwortet nach dem Angriff' : 'Server antwortet NICHT mehr', ok: alive },
    ]);

    writeReport(serverLog, normal, flood, performance.now() - startedAt);
    process.exitCode = failures.length === 0 ? 0 : 1;
  } catch (err) {
    console.error('Lasttest abgebrochen:', err.message);
    process.exitCode = 1;
  } finally {
    if (server) server.kill();
    if (db) await db.end().catch(() => {});
    if (!KEEP) {
      await dropDatabase().catch(() => {});
      log(`Testdatenbank ${TEST_DB} gelöscht.`);
    } else {
      log(`Testdatenbank ${TEST_DB} bleibt erhalten (--keep).`);
    }
  }
})();
