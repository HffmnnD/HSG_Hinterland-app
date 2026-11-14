// Strafenkatalog und Mannschaftskasse – eingebunden in server.js mit
//   require('./fines').mount(app);
// Braucht Migration 031.
//
//   GET    /api/fines?teamId=              Katalog, Strafen und Summen
//   POST   /api/fines/catalog?teamId=      Standardgrund anlegen      (Trainer)
//   POST   /api/fines/catalog/defaults?teamId=  Vorschlagsliste übernehmen (Trainer)
//   PATCH  /api/fines/catalog/:id          Grund ändern               (Trainer)
//   DELETE /api/fines/catalog/:id          Grund löschen              (Trainer)
//   POST   /api/fines?teamId=              Strafe eintragen           (Mannschaft)
//   PATCH  /api/fines/:id                  bezahlt / offen            (Trainer)
//   DELETE /api/fines/:id                  Strafe löschen             (Trainer oder wer sie eingetragen hat)
//
// Lastenheft: Admin, Hauptuser, Trainer und Spieler bearbeiten, Zuschauer
// sehen nichts. Spieler:innen tragen Strafen ein (auch der Kassenwart ist
// meist Spieler:in), Katalog und Kasse führt das Trainerteam.
const express = require('express');

const pool = require('../config/db');
const { authenticate } = require('../middleware/authMiddleware');
const { viewerOf } = require('../access/service');
const teamAccess = require('../services/teamAccess');
const teamRepository = require('../repositories/teamRepository');
const { parseId } = require('../utils/validation');

const router = express.Router();
router.use(authenticate);

const DEFAULTS = [
  ['Zu spät zum Training', 200],
  ['Zu spät zum Spiel oder Treffpunkt', 500],
  ['Unentschuldigt gefehlt', 1000],
  ['Trikot, Schuhe oder Tasche vergessen', 300],
  ['Handy klingelt in der Kabine', 200],
  ['Zeitstrafe wegen Meckerns', 500],
  ['Rote Karte wegen Unsportlichkeit', 1500],
  ['Kabinendienst vergessen', 300],
];

const MANAGE_ONLY = 'Das darf nur das Trainerteam dieser Mannschaft.';
const MAX_CENTS = 100000; // 1.000 €

const cleanText = (value, max) => {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text ? text.slice(0, max) : null;
};

/** Betrag in Cent: ganze Zahl zwischen 0 und 1.000 €. */
function readCents(value) {
  const cents = Number(value);
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_CENTS ? cents : null;
}

function readDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCDate() === +match[3] && date.getUTCMonth() === +match[2] - 1 ? match[0] : null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Mannschaft aus ?teamId= prüfen. */
function requireTeam({ manage = false } = {}) {
  return async (req, res, next) => {
    try {
      const teamId = parseId(req.query.teamId);
      if (!teamId) return res.status(400).json({ message: 'teamId fehlt.' });
      const access = await teamAccess.requireMember(viewerOf(req), teamId);
      if (!access.ok) return res.status(access.status).json({ message: access.message });
      if (manage && !access.canManage) return res.status(403).json({ message: MANAGE_ONLY });
      req.fineTeam = { id: teamId, canManage: access.canManage };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Zeile laden (Katalog oder Strafe) und Mannschaftsrechte prüfen. */
async function loadRow(req, res, table) {
  const id = parseId(req.params.id);
  const [[row]] = id ? await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]) : [[]];
  if (!row) {
    res.status(404).json({ message: 'Eintrag nicht gefunden.' });
    return null;
  }
  const access = await teamAccess.requireMember(viewerOf(req), row.team_id);
  if (!access.ok) {
    res.status(404).json({ message: 'Eintrag nicht gefunden.' });
    return null;
  }
  return { row, canManage: access.canManage };
}

const mapCatalog = (row) => ({ id: row.id, label: row.label, amountCents: row.amount_cents });

async function overview(teamId, canManage, viewerId) {
  const [catalog] = await pool.query('SELECT * FROM fine_catalog WHERE team_id = ? ORDER BY sort_order, id', [teamId]);
  const [rows] = await pool.query(
    `SELECT f.id, f.user_id, f.reason, f.amount_cents, f.note, f.created_by,
            DATE_FORMAT(f.fined_on, '%Y-%m-%d') AS fined_on,
            DATE_FORMAT(f.paid_at, '%Y-%m-%dT%H:%i:%s') AS paid_at,
            u.first_name, u.last_name
       FROM fines f JOIN users u ON u.id = f.user_id
      WHERE f.team_id = ?
      ORDER BY f.fined_on DESC, f.id DESC
      LIMIT 1000`,
    [teamId]
  );
  const players = (await teamRepository.listConfirmedPlayers([teamId])).map((p) => ({
    id: p.userId ?? p.id,
    firstName: p.firstName,
    lastName: p.lastName,
  }));

  const fines = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    reason: row.reason,
    amountCents: row.amount_cents,
    finedOn: row.fined_on,
    note: row.note,
    paidAt: row.paid_at,
    canDelete: canManage || (row.created_by === viewerId && !row.paid_at),
  }));

  const sum = (list) => list.reduce((total, fine) => total + fine.amountCents, 0);
  const open = fines.filter((fine) => !fine.paidAt);
  return {
    canManage,
    catalog: catalog.map(mapCatalog),
    players,
    fines,
    totals: { openCents: sum(open), paidCents: sum(fines) - sum(open), count: fines.length },
  };
}

router.get('/', requireTeam(), async (req, res, next) => {
  try {
    return res.json(await overview(req.fineTeam.id, req.fineTeam.canManage, req.userId));
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------- Katalog --

router.post('/catalog/defaults', requireTeam({ manage: true }), async (req, res, next) => {
  try {
    const teamId = req.fineTeam.id;
    const [existing] = await pool.query('SELECT label FROM fine_catalog WHERE team_id = ?', [teamId]);
    const known = new Set(existing.map((row) => row.label));
    const fresh = DEFAULTS.filter(([label]) => !known.has(label));
    if (fresh.length > 0) {
      await pool.query('INSERT INTO fine_catalog (team_id, label, amount_cents, sort_order) VALUES ?', [
        fresh.map(([label, cents], i) => [teamId, label, cents, existing.length + i]),
      ]);
    }
    return res.status(201).json(await overview(teamId, true, req.userId));
  } catch (err) {
    return next(err);
  }
});

function readCatalogBody(body) {
  const label = cleanText(body?.label, 120);
  const amountCents = readCents(body?.amountCents);
  if (!label) return { ok: false, message: 'Bitte einen Grund angeben.' };
  if (amountCents === null) return { ok: false, message: 'Bitte einen Betrag zwischen 0 und 1.000 € angeben.' };
  return { ok: true, label, amountCents };
}

router.post('/catalog', requireTeam({ manage: true }), async (req, res, next) => {
  try {
    const input = readCatalogBody(req.body);
    if (!input.ok) return res.status(400).json({ message: input.message });
    const [[{ next: order }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM fine_catalog WHERE team_id = ?',
      [req.fineTeam.id]
    );
    await pool.query('INSERT INTO fine_catalog (team_id, label, amount_cents, sort_order) VALUES (?, ?, ?, ?)', [
      req.fineTeam.id, input.label, input.amountCents, order,
    ]);
    return res.status(201).json(await overview(req.fineTeam.id, true, req.userId));
  } catch (err) {
    return next(err);
  }
});

router.patch('/catalog/:id', async (req, res, next) => {
  try {
    const loaded = await loadRow(req, res, 'fine_catalog');
    if (!loaded) return undefined;
    if (!loaded.canManage) return res.status(403).json({ message: MANAGE_ONLY });
    const input = readCatalogBody(req.body);
    if (!input.ok) return res.status(400).json({ message: input.message });
    await pool.query('UPDATE fine_catalog SET label = ?, amount_cents = ? WHERE id = ?', [input.label, input.amountCents, loaded.row.id]);
    return res.json(await overview(loaded.row.team_id, true, req.userId));
  } catch (err) {
    return next(err);
  }
});

router.delete('/catalog/:id', async (req, res, next) => {
  try {
    const loaded = await loadRow(req, res, 'fine_catalog');
    if (!loaded) return undefined;
    if (!loaded.canManage) return res.status(403).json({ message: MANAGE_ONLY });
    await pool.query('DELETE FROM fine_catalog WHERE id = ?', [loaded.row.id]);
    return res.json(await overview(loaded.row.team_id, true, req.userId));
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------- Strafen --

router.post('/', requireTeam(), async (req, res, next) => {
  try {
    const teamId = req.fineTeam.id;
    const userId = parseId(req.body?.userId);
    if (!userId || !(await teamRepository.hasConfirmedRelation(userId, teamId, 'player'))) {
      return res.status(400).json({ message: 'Diese Person steht nicht im Kader der Mannschaft.' });
    }

    let reason = cleanText(req.body?.reason, 160);
    let amountCents = readCents(req.body?.amountCents);
    const catalogId = parseId(req.body?.catalogId);
    if (catalogId) {
      const [[entry]] = await pool.query('SELECT * FROM fine_catalog WHERE id = ? AND team_id = ?', [catalogId, teamId]);
      if (!entry) return res.status(400).json({ message: 'Dieser Grund steht nicht im Katalog.' });
      reason = entry.label;
      // Vom Katalog abweichen darf nur das Trainerteam.
      if (amountCents === null || !req.fineTeam.canManage) amountCents = entry.amount_cents;
    }
    if (!reason) return res.status(400).json({ message: 'Bitte einen Grund wählen oder eintragen.' });
    if (amountCents === null) return res.status(400).json({ message: 'Bitte einen Betrag zwischen 0 und 1.000 € angeben.' });

    const finedOn = req.body?.finedOn ? readDate(req.body.finedOn) : today();
    if (!finedOn || finedOn > today()) return res.status(400).json({ message: 'Bitte ein gültiges Datum (nicht in der Zukunft) angeben.' });

    await pool.query(
      `INSERT INTO fines (team_id, user_id, catalog_id, reason, amount_cents, fined_on, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [teamId, userId, catalogId, reason, amountCents, finedOn, cleanText(req.body?.note, 200), req.actorId ?? req.userId]
    );
    return res.status(201).json(await overview(teamId, req.fineTeam.canManage, req.userId));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const loaded = await loadRow(req, res, 'fines');
    if (!loaded) return undefined;
    if (!loaded.canManage) return res.status(403).json({ message: MANAGE_ONLY });
    if (typeof req.body?.paid !== 'boolean') return res.status(400).json({ message: 'paid muss true oder false sein.' });
    await pool.query('UPDATE fines SET paid_at = ?, paid_marked_by = ? WHERE id = ?', [
      req.body.paid ? new Date() : null,
      req.body.paid ? req.userId : null,
      loaded.row.id,
    ]);
    return res.json(await overview(loaded.row.team_id, true, req.userId));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const loaded = await loadRow(req, res, 'fines');
    if (!loaded) return undefined;
    const own = loaded.row.created_by === req.userId && !loaded.row.paid_at;
    if (!loaded.canManage && !own) return res.status(403).json({ message: MANAGE_ONLY });
    await pool.query('DELETE FROM fines WHERE id = ?', [loaded.row.id]);
    return res.json(await overview(loaded.row.team_id, loaded.canManage, req.userId));
  } catch (err) {
    return next(err);
  }
});

function mount(app) {
  app.use('/api/fines', router);
}

module.exports = { mount };
