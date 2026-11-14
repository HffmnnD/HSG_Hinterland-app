// Vereinsweite Einstellungen (Tabelle app_settings, Migration 018).
//
// Jede Einstellung hat einen Standard; in der Datenbank steht nur, was davon
// abweicht. Gelesen wird oft (bei jedem Abruf der Dienste), geändert selten,
// deshalb hält der Prozess die Werte kurz im Speicher.
const pool = require('../config/db');

const DEFINITIONS = {
  // Wer sieht, wer einen Dienst übernommen hat? Admin und Sub-Admin immer.
  dutyAssignees: { key: 'duty_assignees_visible', values: ['all', 'admins'], fallback: 'all' },
};

const CACHE_MS = 30 * 1000;
let cache = null;
let cachedAt = 0;

async function load() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
  const values = {};
  for (const [name, def] of Object.entries(DEFINITIONS)) values[name] = def.fallback;
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM app_settings');
    for (const row of rows) {
      const entry = Object.entries(DEFINITIONS).find(([, def]) => def.key === row.setting_key);
      if (entry && entry[1].values.includes(row.setting_value)) values[entry[0]] = row.setting_value;
    }
  } catch (err) {
    // Ohne Migration 018 gelten die Standards.
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  cache = values;
  cachedAt = Date.now();
  return values;
}

async function get(name) {
  return (await load())[name];
}

const all = () => load();

/** @returns {{ok:true} | {ok:false, message:string}} */
async function set(name, value, userId) {
  const def = DEFINITIONS[name];
  if (!def) return { ok: false, message: 'Unbekannte Einstellung.' };
  if (!def.values.includes(value)) return { ok: false, message: 'Ungültiger Wert.' };
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [def.key, value, userId]
  );
  cache = null;
  return { ok: true };
}

module.exports = { DEFINITIONS, get, all, set };
