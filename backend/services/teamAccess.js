// Wer darf im Termin-Modul was?
//
// An einer Stelle gebündelt, weil dieselbe Frage in jedem der drei
// Controller auftaucht (Termine, Anwesenheiten, Abwesenheiten) und eine
// Abweichung dort ein Datenleck wäre.
//
//   canManage  Termine anlegen/ändern, ALLE Abmeldegründe sehen, Anwesenheit
//              übersteuern  ->  bestätigte:r Trainer:in dieser Mannschaft
//                               oder admin / sub_admin
//   isPlayer   selbst zu-/absagen, eigene Abwesenheiten pflegen
//              ->  bestätigte:r Spieler:in dieser Mannschaft
//   isMember   Termine der Mannschaft überhaupt sehen
//
// `fan` reicht BEWUSST nicht: Trainingszeiten und Abmeldungen sind interne
// Mannschaftsorganisation, keine Fan-Information.
const teamRepository = require('../repositories/teamRepository');
const { ADMIN_ROLES } = require('../utils/roles');

const SCHEDULE_RELATIONS = ['player', 'coach'];

const NOT_A_MEMBER =
  'Du gehörst nicht zu dieser Mannschaft und kannst ihre Termine nicht sehen.';
const MANAGE_DENIED =
  'Nur Trainer:innen dieser Mannschaft dürfen Termine verwalten.';

/**
 * Rechte einer Person für EINE Mannschaft.
 *
 * @param {{ userId:number, userRole:string }} viewer
 * @param {number} teamId
 * @returns {Promise<{ ok:true, team:object, canManage:boolean,
 *                     isPlayer:boolean, isMember:boolean }
 *                  | { ok:false, status:number, message:string }>}
 */
async function loadTeamAccess(viewer, teamId) {
  const team = await teamRepository.findById(teamId);
  if (!team) {
    return { ok: false, status: 404, message: 'Mannschaft nicht gefunden.' };
  }

  const relations = (await teamRepository.getTeamsForUser(viewer.userId))
    .filter((entry) => entry.id === teamId && entry.isConfirmed)
    .map((entry) => entry.relationType);

  const isAdmin = ADMIN_ROLES.includes(viewer.userRole);
  const canManage = isAdmin || relations.includes('coach');
  const isPlayer = relations.includes('player');

  return {
    ok: true,
    team,
    canManage,
    isPlayer,
    isMember:
      canManage || relations.some((rel) => SCHEDULE_RELATIONS.includes(rel)),
  };
}

/**
 * Wie loadTeamAccess, gibt aber direkt eine Fehlerantwort zurück, wenn die
 * Mannschaft nicht sichtbar ist.
 */
async function requireMember(viewer, teamId) {
  const access = await loadTeamAccess(viewer, teamId);
  if (!access.ok) return access;
  if (!access.isMember) {
    return { ok: false, status: 403, message: NOT_A_MEMBER };
  }
  return access;
}

/** Wie requireMember, verlangt zusätzlich Verwaltungsrechte. */
async function requireManager(viewer, teamId, message = MANAGE_DENIED) {
  const access = await loadTeamAccess(viewer, teamId);
  if (!access.ok) return access;
  if (!access.canManage) {
    return { ok: false, status: 403, message };
  }
  return access;
}

/**
 * Alle Mannschaften, deren Kalender die Person sehen darf.
 *
 * Administration sieht alle Mannschaften: Sie verwaltet ohnehin jede und
 * gehört oft keiner als Spieler:in oder Trainer:in an – ohne diese Ausnahme
 * wäre der Kalender für sie leer.
 *
 * @returns {Promise<{id:number, code:string, name:string, canManage:boolean,
 *                    isPlayer:boolean, handballTeamId:string|null,
 *                    nuligaSyncEnabled:boolean,
 *                    nuligaSyncedAt:string|null}[]>}
 */
async function listAccessibleTeams(viewer) {
  const isAdmin = ADMIN_ROLES.includes(viewer.userRole);
  const [allTeams, relations] = await Promise.all([
    teamRepository.listAll(),
    teamRepository.getTeamsForUser(viewer.userId),
  ]);

  // Beziehungen je Mannschaft zusammenfassen: dieselbe Person kann dort
  // gleichzeitig spielen und trainieren.
  const roles = new Map();
  for (const entry of relations) {
    if (!entry.isConfirmed) continue;
    if (!SCHEDULE_RELATIONS.includes(entry.relationType)) continue;
    const known = roles.get(entry.id) ?? { canManage: false, isPlayer: false };
    if (entry.relationType === 'coach') known.canManage = true;
    if (entry.relationType === 'player') known.isPlayer = true;
    roles.set(entry.id, known);
  }

  return allTeams
    .filter((team) => isAdmin || roles.has(team.id))
    .map((team) => ({
      id: team.id,
      code: team.code,
      name: team.name,
      canManage: isAdmin || (roles.get(team.id)?.canManage ?? false),
      isPlayer: roles.get(team.id)?.isPlayer ?? false,
      // Für den Planungsbereich: gibt es eine Ligaanbindung, und werden die
      // Spiele daraus in den Kalender übernommen?
      handballTeamId: team.handballTeamId,
      nuligaSyncEnabled: team.nuligaSyncEnabled,
      nuligaSyncedAt: team.nuligaSyncedAt,
    }));
}

module.exports = {
  NOT_A_MEMBER,
  MANAGE_DENIED,
  loadTeamAccess,
  requireMember,
  requireManager,
  listAccessibleTeams,
};
