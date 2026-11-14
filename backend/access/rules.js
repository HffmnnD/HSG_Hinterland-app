// Regeln gegen Rechte-Ausweitung. Gelten für JEDE Änderung an Rollen und
// Rechten – im Rechte-Editor genauso wie in der Mitgliederliste.
//
//   1. Niemand vergibt mehr, als er selbst hat: Eine Rolle zuweisen oder ein
//      Recht freigeben darf nur, wer jedes darin enthaltene Recht selbst besitzt.
//   2. Superuser-Rollen (Admin) vergibt und entzieht nur ein Superuser.
//   3. Konten mit Superuser-Rolle bearbeitet nur ein Superuser.
//   4. Die eigenen Rollen und Rechte ändert man nie selbst.
//   5. Es bleibt immer mindestens ein aktiver Superuser.
const repository = require('./repository');

/** Darf `actor` (access-Objekt) diese Rolle vergeben oder entziehen? */
function canAssignRole(actor, role) {
  if (actor.isSuperuser) return true;
  if (role.isSuperuser) return false;
  return role.permissions.every((perm) => actor.permissions.has(perm));
}

/** Darf `actor` dieses Konto in Rollen/Rechten/Sperre anfassen? */
function canTouchTarget(actor, target) {
  return actor.isSuperuser || !target.isSuperuser;
}

/** Darf `actor` dieses Einzelrecht vergeben oder entziehen? */
function canGrant(actor, permission) {
  return actor.isSuperuser || actor.permissions.has(permission);
}

/**
 * Würde der Verein ohne aktiven Superuser dastehen, wenn `target` seinen
 * Superuser-Status verliert?
 */
async function wouldLoseLastSuperuser(target) {
  if (!target.isSuperuser) return false;
  return (await repository.countActiveSuperusers(target.userId)) === 0;
}

module.exports = { canAssignRole, canTouchTarget, canGrant, wouldLoseLastSuperuser };
