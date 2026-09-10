// Datenzugriff für Mannschaften (`teams`) und die Zuordnung Mitglied<->Team
// (`user_teams`). Enthält AUSSCHLIESSLICH SQL – keine Validierung, keine
// HTTP-Logik. Rückgaben sind bereits camelCase für das Frontend aufbereitet.
//
// `is_confirmed` steuert den Beitrittsprozess:
//   0 = offene Beitrittsanfrage (nur der Trainer sieht sie)
//   1 = bestätigt (taucht im öffentlichen Kader auf)
const pool = require('../config/db');

const RELATION_GROUPS = ['player', 'coach', 'fan'];

// Spielpositionen (muss zum ENUM in `user_teams.position` passen).
const POSITIONS = ['tor', 'rueckraum', 'aussen', 'kreis'];

// Spalten der Mannschaft, die überall gleich ausgelesen werden.
const TEAM_COLUMNS =
  'id, code, name, age_group, gender, sort_order, handball_team_id, photo_path';

// Reihenfolge im gesamten Frontend: gepflegte Sortierung zuerst, bei
// Gleichstand alphabetisch. Steht hier einmal, damit jede Abfrage dieselbe
// Reihenfolge liefert.
const TEAM_ORDER = 'sort_order, name, id';

// Geschlecht einer Mannschaft (muss zum ENUM in `teams.gender` passen).
const GENDERS = ['male', 'female', 'mixed'];

// Nur diese Spalten dürfen über updateTeam bzw. updateRelationDetails
// geschrieben werden. Defense-in-depth wie WRITABLE_USER_COLUMNS in
// userRepository.js: die Spaltennamen werden in das UPDATE interpoliert
// (Werte laufen über ?), deshalb dürfen sie NIE aus einer Anfrage stammen.
// Heute liefert utils/validation.js ausschließlich feste Schlüssel – diese
// Prüfung stellt sicher, dass das auch nach künftigen Erweiterungen gilt.
const WRITABLE_TEAM_COLUMNS = new Set([
  'name',
  'code',
  'age_group',
  'gender',
  'sort_order',
  'handball_team_id',
  'photo_path',
]);
const WRITABLE_RELATION_COLUMNS = new Set([
  'jersey_number',
  'position',
  'staff_title',
]);

/**
 * Wirft, sobald ein Feldname nicht auf der Whitelist steht.
 * @param {string[]} keys
 * @param {Set<string>} erlaubt
 */
function assertWritableColumns(keys, erlaubt) {
  const unknown = keys.filter((key) => !erlaubt.has(key));
  if (unknown.length > 0) {
    throw new Error(`Nicht erlaubte Spalte(n): ${unknown.join(', ')}`);
  }
}

/** DB-Zeile einer Mannschaft -> camelCase fürs Frontend. */
function mapTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    // Stammdaten aus der Verwaltung (Migration 006).
    ageGroup: row.age_group ?? null,
    gender: row.gender ?? null,
    sortOrder: row.sort_order ?? 0,
    // nuLiga-Nummer für Tabelle/Spielplan/Ticker. null = keine Ligaanbindung.
    handballTeamId: row.handball_team_id ?? null,
    photoPath: row.photo_path ?? null,
  };
}

// Beziehungstypen, die bei der Registrierung sofort als bestätigt gelten.
const AUTO_CONFIRMED_RELATIONS = new Set(['fan']);

/** is_confirmed-Wert für eine bei der Registrierung angelegte Beziehung. */
function initialConfirmation(relationType) {
  return AUTO_CONFIRMED_RELATIONS.has(relationType) ? 1 : 0;
}

// --- teams -----------------------------------------------------------------

/** Alle Mannschaften in Anzeigereihenfolge. */
async function listAll(runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${TEAM_COLUMNS} FROM teams ORDER BY ${TEAM_ORDER}`
  );
  return rows.map(mapTeam);
}

/**
 * Alle Mannschaften mit ihren Mitgliederzahlen – für die Mannschaftsliste
 * der Verwaltung. LEFT JOIN, damit eine gerade angelegte Mannschaft ohne
 * Kader nicht aus der Liste fällt.
 */
async function listAllWithCounts(runner = pool) {
  const [rows] = await runner.query(
    `SELECT ${TEAM_COLUMNS.split(', ').map((c) => `t.${c}`).join(', ')},
            SUM(ut.relation_type = 'player' AND ut.is_confirmed = 1) AS player_count,
            SUM(ut.relation_type = 'coach'  AND ut.is_confirmed = 1) AS coach_count,
            SUM(ut.relation_type = 'fan'    AND ut.is_confirmed = 1) AS fan_count,
            SUM(ut.is_confirmed = 0)                                 AS pending_count
       FROM teams t
       LEFT JOIN user_teams ut ON ut.team_id = t.id
      GROUP BY t.id
      ORDER BY ${TEAM_ORDER.split(', ').map((c) => `t.${c}`).join(', ')}`
  );

  return rows.map((row) => ({
    ...mapTeam(row),
    counts: {
      player: Number(row.player_count ?? 0),
      coach: Number(row.coach_count ?? 0),
      fan: Number(row.fan_count ?? 0),
      pending: Number(row.pending_count ?? 0),
    },
  }));
}

/**
 * Legt eine Mannschaft an. `fields` enthält bereits geprüfte Spaltennamen
 * (siehe validateTeamCreate).
 *
 * Wirft `ER_DUP_ENTRY`, wenn das Kürzel schon vergeben ist – der Controller
 * macht daraus ein 409. Die Prüfung dem UNIQUE-Index zu überlassen statt
 * vorher zu suchen, schliesst das Rennen zwischen zwei gleichzeitigen
 * Anlagen aus.
 *
 * @returns {Promise<number>} ID der neuen Mannschaft
 */
async function createTeam(fields, runner = pool) {
  const keys = Object.keys(fields);
  assertWritableColumns(keys, WRITABLE_TEAM_COLUMNS);

  const [result] = await runner.query(
    `INSERT INTO teams (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((key) => fields[key])
  );
  return result.insertId;
}

/**
 * Nächste freie Sortiernummer (in Zehnerschritten). Eine neu angelegte
 * Mannschaft landet damit hinten, ohne dass jemand eine Zahl eintippen muss.
 */
async function nextSortOrder(runner = pool) {
  const [[row]] = await runner.query('SELECT MAX(sort_order) AS max FROM teams');
  // SMALLINT UNSIGNED endet bei 65535 – davor deckeln, sonst schlägt das
  // INSERT irgendwann mit einem Bereichsfehler fehl.
  return Math.min(Number(row?.max ?? 0) + 10, 65535);
}

/** Eine Mannschaft anhand ihres Codes (case-insensitiv). null wenn unbekannt. */
async function findByCode(code, runner = pool) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const [rows] = await runner.query(
    `SELECT ${TEAM_COLUMNS} FROM teams WHERE code = ?`,
    [code.trim().toUpperCase()]
  );
  return mapTeam(rows[0]);
}

/**
 * Stammdaten einer Mannschaft ändern (Ligaverknüpfung, Foto).
 * `fields` enthält bereits geprüfte Spaltennamen.
 * @returns {Promise<number>} Anzahl geänderter Zeilen
 */
async function updateTeam(teamId, fields, runner = pool) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  assertWritableColumns(keys, WRITABLE_TEAM_COLUMNS);

  const [result] = await runner.query(
    `UPDATE teams SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => fields[k]), teamId]
  );
  return result.affectedRows;
}

// --- Sponsoren --------------------------------------------------------------

/**
 * Nur http/https durchlassen.
 *
 * Sponsorenlinks landen im Frontend in einem `href`. Ein Wert wie
 * `javascript:…` oder `data:text/html,…` gehört dort nicht hin – React und
 * moderne Browser blocken beides zwar, aber die Zusage „nur http/https" steht
 * in der Spaltenbeschreibung und muss auch durchgesetzt werden. Geprüft wird
 * am Datenrand, damit die Regel für jeden Aufrufer gilt.
 *
 * @returns {string|null} null, wenn das Schema nicht erlaubt ist
 */
function sicherereWebsite(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : null;
  } catch {
    // Kein absoluter Link (z. B. "www.example.de") -> lieber nicht verlinken.
    return null;
  }
}

/** Sponsoren einer Mannschaft in Anzeigereihenfolge. */
async function getSponsors(teamId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT id, name, website_url, sort_order
       FROM team_sponsors
      WHERE team_id = ?
      ORDER BY sort_order, name`,
    [teamId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    websiteUrl: sicherereWebsite(row.website_url),
  }));
}

/** Von einer Liste von IDs die tatsächlich existierenden zurückgeben. */
async function findExistingIds(ids, runner = pool) {
  if (ids.length === 0) return [];
  const [rows] = await runner.query('SELECT id FROM teams WHERE id IN (?)', [ids]);
  return rows.map((row) => row.id);
}

// --- Zuordnungen eines Nutzers ------------------------------------------------

/**
 * Mannschaften eines Nutzers inkl. Beziehungstyp und Bestätigungsstatus.
 * @returns {Promise<{id:number, code:string, name:string,
 *                    relationType:string, isConfirmed:boolean}[]>}
 */
async function getTeamsForUser(userId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT t.id, t.code, t.name, ut.relation_type, ut.is_confirmed
       FROM user_teams ut
       JOIN teams t ON t.id = ut.team_id
      WHERE ut.user_id = ?
      ORDER BY t.id, ut.relation_type`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    relationType: row.relation_type,
    isConfirmed: Boolean(row.is_confirmed),
  }));
}

/** Ist der Nutzer als BESTÄTIGTE:r Trainer:in (`coach`) dieser Mannschaft? */
async function isCoachOf(userId, teamId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = 'coach'
        AND is_confirmed = 1
      LIMIT 1`,
    [userId, teamId]
  );
  return rows.length > 0;
}

/** Hat der Nutzer diese konkrete (bestätigte) Beziehung zur Mannschaft? */
async function hasConfirmedRelation(userId, teamId, relationType, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?
        AND is_confirmed = 1
      LIMIT 1`,
    [userId, teamId, relationType]
  );
  return rows.length > 0;
}

// --- Kader einer Mannschaft ------------------------------------------------

function mapMember(row, includeEmail) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    // Kaderangaben gelten je Mannschaft (siehe Migration 005).
    jerseyNumber: row.jersey_number ?? null,
    position: row.position ?? null,
    staffTitle: row.staff_title ?? null,
    ...(includeEmail ? { email: row.email } : {}),
  };
}

/**
 * BESTÄTIGTER Kader einer Mannschaft, gruppiert nach player / coach / fan.
 * @param {{ includeEmail?: boolean }} [opts] E-Mail nur für Verwaltende ausgeben.
 */
async function getConfirmedRoster(teamId, { includeEmail = false } = {}, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
            ut.relation_type, ut.jersey_number, ut.position, ut.staff_title
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND ut.is_confirmed = 1
      -- Kader nach Rückennummer sortieren (ohne Nummer ans Ende), danach
      -- alphabetisch. So steht die Liste wie im Spielberichtsbogen.
      ORDER BY ut.jersey_number IS NULL, ut.jersey_number, u.last_name, u.first_name`,
    [teamId]
  );

  const roster = { player: [], coach: [], fan: [] };
  for (const row of rows) {
    if (roster[row.relation_type]) {
      roster[row.relation_type].push(mapMember(row, includeEmail));
    }
  }
  return roster;
}

/**
 * OFFENE Beitrittsanfragen einer Mannschaft (is_confirmed = 0) als flache
 * Liste – eine Zeile pro (Nutzer, Beziehungstyp).
 */
async function getPendingMembers(teamId, { includeEmail = false } = {}, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
            ut.relation_type, ut.jersey_number, ut.position, ut.staff_title
       FROM user_teams ut
       JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND ut.is_confirmed = 0
      ORDER BY u.last_name, u.first_name`,
    [teamId]
  );
  return rows.map((row) => ({
    ...mapMember(row, includeEmail),
    relationType: row.relation_type,
  }));
}

/**
 * Freigegebene Mitglieder, die diese Beziehung zur Mannschaft NOCH NICHT haben
 * (auch keine offene Anfrage) – Auswahlliste zum manuellen Hinzufügen.
 */
async function listRosterCandidates(teamId, relationType, runner = pool) {
  const [rows] = await runner.query(
    `SELECT u.id, u.first_name, u.last_name, u.role
       FROM users u
      WHERE u.is_approved = 1
        AND NOT EXISTS (
          SELECT 1 FROM user_teams ut
           WHERE ut.user_id = u.id
             AND ut.team_id = ?
             AND ut.relation_type = ?
        )
      ORDER BY u.last_name, u.first_name`,
    [teamId, relationType]
  );
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
  }));
}

// --- Zuordnungen schreiben ------------------------------------------------

/**
 * Einzelne Beziehung anlegen. Doppelte werden ignoriert; ein bereits
 * vorhandener Eintrag wird auf Wunsch auf bestätigt gehoben.
 * Manuell durch Trainer/Admin -> `isConfirmed = 1` (Default).
 */
async function addRelation(userId, teamId, relationType, isConfirmed = 1, runner = pool) {
  const confirmed = isConfirmed ? 1 : 0;
  const [result] = await runner.query(
    `INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_confirmed = GREATEST(is_confirmed, VALUES(is_confirmed))`,
    [userId, teamId, relationType, confirmed]
  );
  return result;
}

/**
 * Kaderangaben einer bestehenden Zuordnung ändern (Rückennummer, Position,
 * Bezeichnung im Betreuerstab). `fields` enthält bereits geprüfte Spalten.
 * @returns {Promise<number>} Anzahl geänderter Zeilen (0 = Zuordnung fehlt)
 */
async function updateRelationDetails(userId, teamId, relationType, fields, runner = pool) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return 0;
  assertWritableColumns(keys, WRITABLE_RELATION_COLUMNS);

  const [result] = await runner.query(
    `UPDATE user_teams
        SET ${keys.map((k) => `${k} = ?`).join(', ')}
      WHERE user_id = ? AND team_id = ? AND relation_type = ?`,
    [...keys.map((k) => fields[k]), userId, teamId, relationType]
  );
  return result.affectedRows;
}

/**
 * Ist die Rückennummer in dieser Mannschaft schon vergeben?
 * Zwei Feldspieler mit derselben Nummer wären im Spielbericht unzulässig –
 * deshalb prüft der Controller das, bevor er speichert.
 */
async function isJerseyNumberTaken(teamId, jerseyNumber, exceptUserId, runner = pool) {
  const [rows] = await runner.query(
    `SELECT 1 FROM user_teams
      WHERE team_id = ? AND jersey_number = ? AND relation_type = 'player'
        AND user_id <> ?
      LIMIT 1`,
    [teamId, jerseyNumber, exceptUserId]
  );
  return rows.length > 0;
}

/** Einzelne Beziehung entfernen (dient auch dem Ablehnen einer Anfrage). */
async function removeRelation(userId, teamId, relationType, runner = pool) {
  const [result] = await runner.query(
    `DELETE FROM user_teams
      WHERE user_id = ? AND team_id = ? AND relation_type = ?`,
    [userId, teamId, relationType]
  );
  return result;
}

/**
 * Bestätigt offene Anfragen eines Nutzers für eine Mannschaft.
 * Ohne `relationType` werden alle offenen Beziehungen bestätigt.
 * @returns {Promise<number>} Anzahl bestätigter Zeilen
 */
async function confirmRelations(userId, teamId, relationType, runner = pool) {
  const params = [userId, teamId];
  let sql =
    'UPDATE user_teams SET is_confirmed = 1 WHERE user_id = ? AND team_id = ? AND is_confirmed = 0';
  if (relationType !== undefined) {
    sql += ' AND relation_type = ?';
    params.push(relationType);
  }
  const [result] = await runner.query(sql, params);
  return result.affectedRows;
}

/**
 * Mehrere Beziehungen auf einmal einfügen (bei der Registrierung).
 * player/coach -> is_confirmed 0 (Anfrage), fan -> 1. Muss in einer
 * Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ teamId:number, relationType:string }[]} relations
 */
async function insertRelations(conn, userId, relations) {
  if (relations.length === 0) return;
  await conn.query(
    'INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed) VALUES ?',
    [
      relations.map((rel) => [
        userId,
        rel.teamId,
        rel.relationType,
        initialConfirmation(rel.relationType),
      ]),
    ]
  );
}

/**
 * Ersetzt für EINEN Beziehungstyp alle Mannschaften eines Nutzers
 * (andere Beziehungstypen bleiben unberührt). Von Admin/Trainer ausgelöst ->
 * die neuen Einträge gelten als bestätigt. Muss in einer Transaktion laufen.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function replaceRelationTeams(conn, userId, teamIds, relationType) {
  await conn.query(
    'DELETE FROM user_teams WHERE user_id = ? AND relation_type = ?',
    [userId, relationType]
  );
  if (teamIds.length > 0) {
    await conn.query(
      'INSERT INTO user_teams (user_id, team_id, relation_type, is_confirmed) VALUES ?',
      [teamIds.map((teamId) => [userId, teamId, relationType, 1])]
    );
  }
}

module.exports = {
  RELATION_GROUPS,
  POSITIONS,
  GENDERS,
  listAll,
  listAllWithCounts,
  findByCode,
  createTeam,
  nextSortOrder,
  updateTeam,
  getSponsors,
  updateRelationDetails,
  isJerseyNumberTaken,
  findExistingIds,
  getTeamsForUser,
  isCoachOf,
  hasConfirmedRelation,
  getConfirmedRoster,
  getPendingMembers,
  listRosterCandidates,
  addRelation,
  removeRelation,
  confirmRelations,
  insertRelations,
  replaceRelationTeams,
};
