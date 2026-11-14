// Wer darf in der Infothek was?
//
// Seit Migration 035 gibt es nur noch einen Bereich: die Dokumente unter
// Verein → Infos (früher „Schwarzes Brett"). Mannschafts- und Trainerbereich
// wurden entfernt.
//
//   lesen      alle Vereinsmitglieder (mehr als Zuschauer:in)
//   schreiben  Recht board.manage (Admin, Hauptuser, Vorstand)
const teamRepository = require('../repositories/teamRepository');

const SCOPES = ['board'];
const DENIED = { ok: false, status: 403, message: 'Dieser Bereich ist für dich nicht freigeschaltet.' };

/** Gehört die Person zum Verein (mehr als Zuschauer:in)? */
async function isClubMember(req) {
  const roles = req.access?.roles ?? [];
  if (req.access?.isSuperuser || roles.some((role) => role !== 'zuschauer')) return true;
  const relations = await teamRepository.getTeamsForUser(req.userId);
  return relations.some((entry) => entry.isConfirmed && entry.relationType !== 'fan');
}

/**
 * Rechte für einen Bereich.
 * @returns {Promise<{ok:true, canManage:boolean} | {ok:false, status:number, message:string}>}
 */
async function resolve(req, scope) {
  if (scope !== 'board') return { ok: false, status: 400, message: 'Unbekannter Bereich.' };
  const canManage = Boolean(req.access?.permissions?.has('board.manage'));
  if (!canManage && !(await isClubMember(req))) return DENIED;
  return { ok: true, canManage };
}

/** Welche Bereiche sieht die Person überhaupt? (für Navigation und Startseite) */
async function overview(req) {
  const board = await resolve(req, 'board');
  return { board: board.ok ? { canManage: board.canManage } : null };
}

module.exports = { SCOPES, resolve, overview, isClubMember };
