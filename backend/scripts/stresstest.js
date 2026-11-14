// Stresstest gegen eine EIGENE Testdatenbank.
//
//   npm run stresstest                     10.000 Konten, danach aufräumen
//   npm run stresstest -- --users 20000    mehr Konten
//   npm run stresstest -- --keep           Testdatenbank behalten
//   npm run stresstest -- --burst 2000     so viele Anfragen gleichzeitig (Standard 1000, Windows 300)
//
// Ablauf:
//   1. legt `<DB_NAME>_stresstest` an (Schema + alle Migrationen)
//   2. füllt sie mit Konten, Mannschaften, Trainings und Dienstplänen
//   3. startet das Backend auf Port 5099 gegen diese Datenbank
//   4. schickt viele gleichzeitige Anfragen (siehe SZENARIEN unten)
//   5. prüft danach die Daten (keine Überbuchung, keine Doppel-Einträge …)
//   6. schreibt das Ergebnis nach backend/stresstest-ergebnis.md
//   7. löscht die Testdatenbank (außer mit --keep)
//
// Die echte Datenbank wird nie angefasst: Der Name endet immer auf
// `_stresstest`, und gelöscht wird nur eine Datenbank mit genau diesem Ende.
// Angemeldet wird mit selbst ausgestellten Tokens (JWT_SECRET aus .env) –
// 10.000 Logins über das echte Formular würde die Login-Bremse (10 je IP und
// Viertelstunde) zu Recht abweisen. Die Bremse selbst prüft Szenario 9.
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
const USERS = argValue('users', 10000);
// Windows weist bei 1000 gleichzeitigen Verbindungen einen Teil ab (ECONNREFUSED).
const BURST = argValue('burst', process.platform === 'win32' ? 300 : 1000);
const KEEP = args.includes('--keep');
const PORT = argValue('port', 5099);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'Stresstest-123';

const BASE_DB = process.env.DB_NAME || 'hsg_hinterland';
const TEST_DB = `${BASE_DB}_stresstest`;
const BACKEND = path.join(__dirname, '..');
const REPORT = path.join(BACKEND, 'stresstest-ergebnis.md');

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
const isoLocal = (d) => sqlDate(d).replace(' ', 'T').slice(0, 16);
const daysFromNow = (days, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(new Date().toLocaleTimeString('de-DE'), ...parts);

const tokenCache = new Map();
function tokenFor(id, role = 'spieler') {
  const key = `${id}:${role}`;
  if (!tokenCache.has(key)) {
    tokenCache.set(key, jwt.sign({ sub: id, role }, process.env.JWT_SECRET, { expiresIn: '2h' }));
  }
  return tokenCache.get(key);
}

/** Eine Anfrage mit Zeitmessung. Wirft nie. */
async function call(method, url, { user = null, role = 'spieler', body } = {}) {
  const started = performance.now();
  try {
    const res = await fetch(BASE + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Cookie: `token=${tokenFor(user, role)}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ms: performance.now() - started, data };
  } catch (err) {
    return { status: 0, ms: performance.now() - started, data: { message: err.cause?.code ?? err.message } };
  }
}

/** Aufgaben mit höchstens `limit` gleichzeitig laufen lassen. */
async function runLimited(tasks, limit = BURST) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function summarize(results) {
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const at = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))] : 0);
  return {
    count: results.length,
    statuses,
    p50: Math.round(at(0.5)),
    p95: Math.round(at(0.95)),
    p99: Math.round(at(0.99)),
    max: Math.round(times[times.length - 1] ?? 0),
    errors5xx: results.filter((r) => r.status >= 500 || r.status === 0).length,
    sampleErrors: [...new Set(results.filter((r) => r.status >= 500 || r.status === 0).map((r) => r.data?.detail ?? r.data?.message))].slice(0, 3),
  };
}

const report = [];
const failures = [];
function record(name, description, results, checks = []) {
  const summary = summarize(results);
  for (const check of checks) if (!check.ok) failures.push(`${name}: ${check.label}`);
  if (summary.errors5xx > 0) failures.push(`${name}: ${summary.errors5xx} Serverfehler/Abbrüche`);
  report.push({ name, description, summary, checks });
  const ok = checks.every((c) => c.ok) && summary.errors5xx === 0;
  log(`${ok ? 'OK  ' : 'FEHLER'} ${name}`, JSON.stringify(summary.statuses), `p95 ${summary.p95} ms`);
  for (const check of checks) if (!check.ok) log('   ✗', check.label);
}

// --- 1. Testdatenbank --------------------------------------------------------

async function createDatabase() {
  if (!TEST_DB.endsWith('_stresstest')) throw new Error('Unerwarteter Datenbankname.');
  const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  const schema = fs
    .readFileSync(path.join(BACKEND, 'db', 'schema.sql'), 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS\s+\w+/i, `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\``)
    .replace(/^USE\s+\w+;/im, `USE \`${TEST_DB}\`;`);
  await conn.query(schema);
  await conn.end();

  // Migrationen mit demselben Runner wie `npm run migrate`.
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
  if (!TEST_DB.endsWith('_stresstest')) return;
  const conn = await mysql.createConnection(dbConfig);
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
  await conn.end();
}

// --- 2. Testdaten ------------------------------------------------------------

async function seed(db) {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Konten: 2 Admins, danach Mitglieder. Jedes dritte hilft bei Diensten mit.
  const rows = [];
  for (let i = 0; i < USERS; i += 1) {
    rows.push([
      `Test${i}`,
      `Person${i}`,
      `stress${i}@test.invalid`,
      hash,
      i < 2 ? 'admin' : 'spieler',
    ]);
  }
  for (let i = 0; i < rows.length; i += 2000) {
    await db.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role, onboarding_completed_at) VALUES ' +
        rows
          .slice(i, i + 2000)
          .map(() => '(?, ?, ?, ?, ?, NOW())')
          .join(', '),
      rows.slice(i, i + 2000).flat()
    );
  }
  const [[{ firstId }]] = await db.query('SELECT MIN(id) AS firstId FROM users');
  const userIds = Array.from({ length: USERS }, (_, i) => firstId + i);
  const admins = userIds.slice(0, 2);
  const members = userIds.slice(2);

  // Mannschaften zu je ~50 Spieler:innen.
  const teamCount = Math.max(1, Math.ceil(members.length / 50));
  const teamRows = Array.from({ length: teamCount }, (_, i) => [`ST${i}`, `Stresstest ${i}`, 'Senioren', 'male', 1000 + i]);
  await db.query('INSERT INTO teams (code, name, age_group, gender, sort_order) VALUES ?', [teamRows]);
  const [teams] = await db.query("SELECT id FROM teams WHERE code LIKE 'ST%' ORDER BY id");
  const teamIds = teams.map((t) => t.id);

  const memberships = members.map((userId, i) => [userId, teamIds[i % teamIds.length], 'player', 1]);
  // Je Mannschaft ein Trainer: das erste Mitglied.
  for (let t = 0; t < teamIds.length && t < members.length; t += 1) {
    memberships.push([members[t], teamIds[t], 'coach', 1]);
  }
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
        const start = daysFromNow(week * 7 + offset, 19);
        const end = daysFromNow(week * 7 + offset, 20, 30);
        events.push([teamId, 'Training', 'REGULAR_TRAINING', 'Testhalle', sqlDate(start), sqlDate(end), admins[0]]);
      }
    }
  }
  for (let i = 0; i < events.length; i += 5000) {
    await db.query(
      'INSERT INTO events (team_id, title, type, location, start_time, end_time, created_by) VALUES ?',
      [events.slice(i, i + 5000)]
    );
  }

  // 20 veröffentlichte Dienstpläne mit je 30 Diensten, 2–4 Plätze.
  for (let p = 0; p < 20; p += 1) {
    const [plan] = await db.query(
      "INSERT INTO duty_plans (title, location, status, published_at, created_by) VALUES (?, 'Testhalle', 'published', NOW(), ?)",
      [`Spieltag ${p}`, admins[0]]
    );
    const duties = [];
    for (let d = 0; d < 30; d += 1) {
      const start = daysFromNow(10 + p, 8, 0);
      start.setMinutes(start.getMinutes() + d * 30);
      const end = new Date(start.getTime() + 30 * 60000);
      duties.push([plan.insertId, `Dienst ${d}`, sqlDate(start), sqlDate(end), 2 + (d % 3)]);
    }
    await db.query('INSERT INTO duties (plan_id, title, start_time, end_time, capacity) VALUES ?', [duties]);
  }

  return { admins, members, teamIds };
}

async function createPlan(admin, title, duties) {
  const res = await call('POST', '/api/duties/plans', {
    user: admin,
    role: 'admin',
    body: { title, duties, publish: true, notify: false },
  });
  if (res.status !== 201) throw new Error(`Plan anlegen fehlgeschlagen: ${res.status} ${res.data?.message}`);
  const plan = await call('GET', `/api/duties/plans/${res.data.planId}`, { user: admin, role: 'admin' });
  return plan.data.plan;
}

// --- 3. Server ---------------------------------------------------------------

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
    const res = await call('GET', '/api/test');
    if (res.status === 200) return;
    await sleep(500);
  }
  throw new Error('Backend startet nicht.');
}

// --- 4. Szenarien ------------------------------------------------------------

async function scenarios(db, { admins, members, teamIds }) {
  const [admin, admin2] = admins;
  const people = shuffle(members);

  // 1 — Alle auf einen Platz
  {
    const plan = await createPlan(admin, 'Ansturm', [
      { title: 'Ein Platz für viele', startTime: isoLocal(daysFromNow(40, 10)), endTime: isoLocal(daysFromNow(40, 12)), capacity: 5 },
    ]);
    const duty = plan.duties[0];
    const crowd = people.slice(0, Math.min(5000, people.length));
    const results = await runLimited(
      crowd.map((user) => () => call('POST', `/api/duties/${duty.id}/claim`, { user, body: { clientTime: new Date().toISOString() } }))
    );
    const [[{ taken }]] = await db.query('SELECT COUNT(*) AS taken FROM duty_assignments WHERE duty_id = ?', [duty.id]);
    const okCount = results.filter((r) => r.status === 201).length;
    const fullCount = results.filter((r) => r.status === 409 && r.data?.code === 'DUTY_FULL').length;
    record('1. Ansturm auf einen Dienst', `${crowd.length} Personen wollen gleichzeitig einen Dienst mit 5 Plätzen.`, results, [
      { label: `genau 5 eingetragen (ist: ${taken})`, ok: taken === 5 },
      { label: `genau 5 Zusagen bestätigt (ist: ${okCount})`, ok: okCount === 5 },
      { label: `alle anderen sehen „bereits vergeben" (ist: ${fullCount} von ${crowd.length - 5})`, ok: fullCount === crowd.length - 5 },
    ]);
  }

  // 2 — Viele Dienste, viele Leute, zufällig verteilt
  {
    const [rows] = await db.query("SELECT d.id FROM duties d JOIN duty_plans p ON p.id = d.plan_id WHERE p.title LIKE 'Spieltag %'");
    const dutyIds = rows.map((r) => r.id);
    const crowd = people.slice(0, Math.min(8000, people.length));
    const results = await runLimited(
      crowd.map((user) => () =>
        call('POST', `/api/duties/${dutyIds[Math.floor(Math.random() * dutyIds.length)]}/claim`, {
          user,
          body: { clientTime: new Date().toISOString() },
        })
      )
    );
    const [over] = await db.query(
      `SELECT d.id, d.capacity, COUNT(a.user_id) AS taken FROM duties d
         JOIN duty_assignments a ON a.duty_id = d.id GROUP BY d.id HAVING taken > d.capacity`
    );
    const [[{ slots }]] = await db.query("SELECT SUM(capacity) AS slots FROM duties d JOIN duty_plans p ON p.id = d.plan_id WHERE p.title LIKE 'Spieltag %'");
    const [[{ filled }]] = await db.query("SELECT COUNT(*) AS filled FROM duty_assignments a JOIN duties d ON d.id = a.duty_id JOIN duty_plans p ON p.id = d.plan_id WHERE p.title LIKE 'Spieltag %'");
    const okCount = results.filter((r) => r.status === 201).length;
    record('2. Zufällige Zusagen auf 600 Dienste', `${crowd.length} Personen sagen gleichzeitig für zufällige Dienste zu (${slots} Plätze).`, results, [
      { label: `kein Dienst überbucht (überbucht: ${over.length})`, ok: over.length === 0 },
      { label: `bestätigte Zusagen = Einträge in der Datenbank (${okCount} / ${filled})`, ok: okCount === Number(filled) },
    ]);
  }

  // 3 — Doppelklick: dieselbe Person schickt dieselbe Zusage mehrfach gleichzeitig
  {
    const plan = await createPlan(admin, 'Doppelklick', [
      { title: 'Großer Dienst', startTime: isoLocal(daysFromNow(41, 10)), endTime: isoLocal(daysFromNow(41, 12)), capacity: 50 },
    ]);
    const duty = plan.duties[0];
    const crowd = people.slice(0, 200);
    const tasks = crowd.flatMap((user) => Array.from({ length: 5 }, () => () => call('POST', `/api/duties/${duty.id}/claim`, { user, body: {} })));
    const results = await runLimited(shuffle(tasks));
    const [[{ taken }]] = await db.query('SELECT COUNT(*) AS taken FROM duty_assignments WHERE duty_id = ?', [duty.id]);
    const [[{ distinct }]] = await db.query('SELECT COUNT(DISTINCT user_id) AS `distinct` FROM duty_assignments WHERE duty_id = ?', [duty.id]);
    record('3. Mehrfach-Klick', '200 Personen tippen je 5-mal gleichzeitig auf „Übernehmen" (50 Plätze).', results, [
      { label: `genau 50 eingetragen (ist: ${taken})`, ok: taken === 50 },
      { label: `niemand doppelt (${distinct} verschiedene)`, ok: distinct === taken },
    ]);
  }

  // 4 — Überschneidung: eine Person, vier gleichzeitige Dienste, alle parallel
  {
    const slot = (n) => ({ title: `Parallel ${n}`, startTime: isoLocal(daysFromNow(42, 10)), endTime: isoLocal(daysFromNow(42, 12)), capacity: 50 });
    const plan = await createPlan(admin, 'Überschneidung', [slot(1), slot(2), slot(3), slot(4)]);
    const crowd = people.slice(200, 400);
    const tasks = crowd.flatMap((user) => plan.duties.map((duty) => () => call('POST', `/api/duties/${duty.id}/claim`, { user, body: {} })));
    const results = await runLimited(shuffle(tasks));
    const [double] = await db.query(
      `SELECT a.user_id FROM duty_assignments a JOIN duties d ON d.id = a.duty_id
        WHERE d.plan_id = ? GROUP BY a.user_id HAVING COUNT(*) > 1`,
      [plan.id]
    );
    record('4. Überschneidende Dienste', '200 Personen versuchen gleichzeitig, vier zeitgleiche Dienste (je 50 Plätze) zu nehmen.', results, [
      { label: `niemand hat zwei zeitgleiche Dienste (betroffen: ${double.length})`, ok: double.length === 0 },
    ]);
  }

  // 5 — Zusagen und Austragen im Wechsel
  {
    const plan = await createPlan(admin, 'Hin und her', [
      { title: 'Wechselnd', startTime: isoLocal(daysFromNow(45, 10)), endTime: isoLocal(daysFromNow(45, 12)), capacity: 10 },
    ]);
    const duty = plan.duties[0];
    const crowd = people.slice(400, 700);
    const tasks = [];
    for (let round = 0; round < 6; round += 1) {
      for (const user of crowd) {
        tasks.push(() => call(round % 2 === 0 ? 'POST' : 'DELETE', `/api/duties/${duty.id}/claim`, { user, body: round % 2 === 0 ? {} : undefined }));
      }
    }
    const results = await runLimited(shuffle(tasks));
    const [[{ taken }]] = await db.query('SELECT COUNT(*) AS taken FROM duty_assignments WHERE duty_id = ?', [duty.id]);
    record('5. Zusagen und Austragen durcheinander', '300 Personen sagen je dreimal zu und tragen sich dreimal aus, alles gemischt (10 Plätze).', results, [
      { label: `nie mehr als 10 eingetragen (ist: ${taken})`, ok: taken <= 10 },
    ]);
  }

  // 6 — Zwei Admins ändern denselben Dienst, während Leute zusagen
  {
    const plan = await createPlan(admin, 'Admin-Konflikt', [
      { title: 'Umkämpft', startTime: isoLocal(daysFromNow(46, 10)), endTime: isoLocal(daysFromNow(46, 12)), capacity: 20 },
    ]);
    const duty = plan.duties[0];
    const crowd = people.slice(700, 1200);
    const tasks = crowd.map((user) => () => call('POST', `/api/duties/${duty.id}/claim`, { user, body: {} }));
    for (let i = 0; i < 40; i += 1) {
      const actor = i % 2 === 0 ? admin : admin2;
      tasks.push(() => call('PATCH', `/api/duties/${duty.id}`, { user: actor, role: 'admin', body: { capacity: 5 + (i % 16) } }));
      tasks.push(() => call('PATCH', `/api/duties/${duty.id}`, { user: actor, role: 'admin', body: { title: `Umkämpft ${i}` } }));
    }
    const results = await runLimited(shuffle(tasks));
    const [[row]] = await db.query(
      'SELECT d.capacity, (SELECT COUNT(*) FROM duty_assignments a WHERE a.duty_id = d.id) AS taken FROM duties d WHERE d.id = ?',
      [duty.id]
    );
    record('6. Zwei Admins ändern gleichzeitig', '500 Zusagen, dazu zwei Admins, die Plätze und Titel desselben Dienstes 80-mal ändern.', results, [
      { label: `Belegung passt zu den Plätzen (${row.taken} von ${row.capacity})`, ok: row.taken <= row.capacity },
    ]);
  }

  // 7 — Dienst wird gelöscht, während Leute zusagen
  {
    const plan = await createPlan(admin, 'Löschen', [
      { title: 'Verschwindet', startTime: isoLocal(daysFromNow(47, 10)), endTime: isoLocal(daysFromNow(47, 12)), capacity: 30 },
    ]);
    const duty = plan.duties[0];
    const crowd = people.slice(1200, 1700);
    const claim = (user) => () => call('POST', `/api/duties/${duty.id}/claim`, { user, body: {} });
    // Erst laufen Zusagen an, dann kommt das Löschen mitten hinein.
    const first = runLimited(crowd.slice(0, 250).map(claim));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const rest = await runLimited([
      () => call('DELETE', `/api/duties/${duty.id}`, { user: admin, role: 'admin' }),
      ...crowd.slice(250).map(claim),
    ]);
    const results = [...(await first), ...rest];
    const [[{ left }]] = await db.query('SELECT COUNT(*) AS `left` FROM duty_assignments WHERE duty_id = ?', [duty.id]);
    record('7. Löschen während Zusagen', '500 Zusagen, mittendrin löscht ein Admin den Dienst.', results, [
      { label: `keine verwaisten Einträge (ist: ${left})`, ok: left === 0 },
    ]);
  }

  // 8 — Training: viele Ab- und Zusagen gleichzeitig
  {
    const teamId = teamIds[0];
    const [[event]] = await db.query('SELECT id FROM events WHERE team_id = ? AND start_time > NOW() + INTERVAL 2 DAY ORDER BY start_time LIMIT 1', [teamId]);
    const [players] = await db.query("SELECT user_id FROM user_teams WHERE team_id = ? AND relation_type = 'player'", [teamId]);
    const tasks = players.flatMap(({ user_id: user }) =>
      Array.from({ length: 10 }, (_, i) => () =>
        call('POST', '/api/attendances/respond', {
          user,
          body: { eventId: event.id, status: i % 2 === 0 ? 'DECLINED' : 'ATTENDING', reason: i % 2 === 0 ? 'Stresstest' : null },
        })
      )
    );
    const results = await runLimited(shuffle(tasks));
    const [dupes] = await db.query('SELECT user_id FROM attendances WHERE event_id = ? GROUP BY user_id HAVING COUNT(*) > 1', [event.id]);
    record('8. Training: Zu- und Absagen', `${players.length} Spieler:innen schicken je 10 wechselnde Antworten gleichzeitig.`, results, [
      { label: `je Person höchstens ein Eintrag (doppelt: ${dupes.length})`, ok: dupes.length === 0 },
    ]);
  }

  // 9 — Login-Bremse
  {
    const results = await runLimited(
      Array.from({ length: 30 }, (_, i) => () => call('POST', '/api/auth/login', { body: { email: `stress${10 + i}@test.invalid`, password: PASSWORD } }))
    );
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;
    record('9. Login-Bremse', '30 Anmeldungen gleichzeitig von einer Adresse.', results, [
      { label: `höchstens 10 durchgelassen (ist: ${ok}), Rest gebremst (${limited})`, ok: ok <= 10 && ok + limited === 30 },
    ]);
  }

  // 10 — Lesen unter Last
  {
    const from = sqlDate(daysFromNow(0)).slice(0, 10);
    const to = sqlDate(daysFromNow(42)).slice(0, 10);
    const crowd = people.slice(0, Math.min(3000, people.length));
    const tasks = crowd.flatMap((user) => [
      () => call('GET', '/api/duties', { user }),
      () => call('GET', `/api/events?from=${from}&to=${to}`, { user }),
      () => call('GET', `/api/duties?from=${from}&to=${to}`, { user }),
    ]);
    const results = await runLimited(shuffle(tasks));
    record('10. Lesen unter Last', `${crowd.length} Personen öffnen gleichzeitig Dienste, Kalender und Monatsansicht.`, results);
  }

  // 11 — Einstellungen gleichzeitig ändern
  {
    const crowd = people.slice(0, 1000);
    const tasks = crowd.flatMap((user) => [
      () => call('PATCH', '/api/auth/me/preferences', { user, body: { theme: 'dark' } }),
      () => call('PATCH', '/api/auth/me/preferences', { user, body: { theme: 'system' } }),
      () => call('PATCH', '/api/push/settings', { user, body: { dutyReminderHours: 48 } }),
    ]);
    const results = await runLimited(shuffle(tasks));
    record('11. Einstellungen', '1.000 Personen ändern gleichzeitig Design und Erinnerung.', results);
  }

  // Gesamtprüfung über alle Dienste
  const [over] = await db.query(
    'SELECT d.id FROM duties d JOIN duty_assignments a ON a.duty_id = d.id GROUP BY d.id, d.capacity HAVING COUNT(*) > d.capacity'
  );
  const [overlap] = await db.query(
    `SELECT a1.user_id FROM duty_assignments a1
       JOIN duties d1 ON d1.id = a1.duty_id
       JOIN duty_assignments a2 ON a2.user_id = a1.user_id AND a2.duty_id > a1.duty_id
       JOIN duties d2 ON d2.id = a2.duty_id
      WHERE d1.start_time < d2.end_time AND d2.start_time < d1.end_time
      LIMIT 5`
  );
  record('Gesamt', 'Prüfung aller Dienste nach dem Test.', [], [
    { label: `kein Dienst überbucht (${over.length})`, ok: over.length === 0 },
    { label: `niemand mit zwei zeitgleichen Diensten (${overlap.length})`, ok: overlap.length === 0 },
  ]);
}

// --- 5. Bericht --------------------------------------------------------------

function writeReport(serverLog, durationMs) {
  const unhandled = serverLog.filter((line) => /Unbehandelter Fehler|uncaught|Unbehandelte Promise/i.test(line));
  const deadlocks = serverLog.filter((line) => /deadlock/i.test(line));
  const lines = [
    '# Stresstest-Ergebnis',
    '',
    `Stand: ${new Date().toLocaleString('de-DE')} · ${USERS.toLocaleString('de-DE')} Konten · bis zu ${BURST} Anfragen gleichzeitig · Dauer ${Math.round(durationMs / 1000)} s`,
    `Datenbank-Verbindungen des Backends: ${process.env.DB_CONNECTION_LIMIT || 10} (DB_CONNECTION_LIMIT)`,
    '',
    failures.length === 0 ? '**Alle Prüfungen bestanden.**' : `**${failures.length} Prüfung(en) fehlgeschlagen:**\n\n${failures.map((f) => `- ${f}`).join('\n')}`,
    '',
    '| Szenario | Anfragen | Antworten | Median | 95 % | 99 % | langsamste | Prüfungen |',
    '|---|---:|---|---:|---:|---:|---:|---|',
    ...report.map(({ name, summary, checks }) =>
      summary.count === 0
        ? `| ${name} | – | – | – | – | – | – | ${checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`).join('<br>')} |`
        : `| ${name} | ${summary.count} | ${Object.entries(summary.statuses).map(([s, n]) => `${s}: ${n}`).join(', ')} | ${summary.p50} ms | ${summary.p95} ms | ${summary.p99} ms | ${summary.max} ms | ${checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label}`).join('<br>')} |`
    ),
    '',
    '## Was getestet wurde',
    '',
    ...report.map(({ name, description, summary }) =>
      `- **${name}:** ${description}${summary.sampleErrors.length ? ` Fehler: ${summary.sampleErrors.join('; ')}` : ''}`
    ),
    '',
    '## Server-Protokoll',
    '',
    `- Unbehandelte Fehler: ${unhandled.length}`,
    `- Deadlock-Meldungen: ${deadlocks.length}`,
    ...(unhandled.length ? ['', '```', ...unhandled.slice(0, 20), '```'] : []),
    '',
    'Statuscodes: 200/201 erfolgreich, 409 abgelehnt (vergeben, Überschneidung, zu spät), 429 gebremst, 5xx Serverfehler, 0 Verbindung abgebrochen.',
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
}

// --- Ablauf ------------------------------------------------------------------

async function main() {
  const started = Date.now();
  log(`Testdatenbank ${TEST_DB} anlegen …`);
  await createDatabase();

  const db = await mysql.createConnection({ ...dbConfig, database: TEST_DB });
  log(`${USERS.toLocaleString('de-DE')} Konten, Mannschaften, Trainings und Dienstpläne anlegen …`);
  const data = await seed(db);

  const serverLog = [];
  log(`Backend auf Port ${PORT} starten …`);
  const server = startServer(serverLog);
  try {
    await waitForServer();
    log('Szenarien laufen …');
    await scenarios(db, data);
  } finally {
    server.kill();
    await db.end();
  }

  writeReport(serverLog, Date.now() - started);
  log(`Bericht: ${REPORT}`);

  if (!KEEP) {
    await dropDatabase();
    log(`Testdatenbank ${TEST_DB} gelöscht.`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error('Stresstest abgebrochen:', err.message);
  if (!KEEP) await dropDatabase().catch(() => {});
  process.exit(1);
});
