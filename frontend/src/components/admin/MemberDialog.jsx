import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { groupPermissions, useAccess } from '../../hooks/useAccess';
import { roleLabel } from '../../lib/roles';
import { SERVICE_LABELS, relationLabelPlural } from '../../lib/participation';
import Modal from '../ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import Avatar from '../ui/Avatar';
import TeamSelect from '../TeamSelect';
import { ErrorNote, SuccessNote } from './ui/Feedback';

/**
 * Ein Mitglied bearbeiten. Jeder Abschnitt erscheint nur mit dem passenden
 * Recht und speichert für sich – so ist immer klar, was gerade geändert wird.
 *
 *   Konto           Sperren/Entsperren           members.lock
 *   Rollen          Grund- und Zusatzrollen      members.roles
 *   Mannschaften    Spieler-Zuordnung            members.edit (oder eigene Teams als Trainer:in)
 *   Helferdienste                                members.edit
 *   Einzelrechte    erlauben / entziehen         access.manage
 */
export default function MemberDialog({ member, roles, allTeams, onClose, onChanged }) {
  const { user: currentUser, can } = useAuth();
  const [local, setLocal] = useState(member);
  const [grants, setGrants] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();
  const [notice, setNotice] = useState(null);

  const isSelf = member.id === currentUser?.id;


  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/access/users/${member.id}`)
      .then((data) => !cancelled && setGrants(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  // Admin-Konten bearbeitet nur ein Admin (Backend prüft genauso).
  const editable = grants ? grants.editable : false;

  const run = async (key, request, message) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const data = await request();
      setNotice(message ?? data?.message ?? 'Gespeichert.');
      onChanged();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const patch = (key, body, optimistic) =>
    run(key, async () => {
      const data = await apiFetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setLocal((prev) => ({ ...prev, ...optimistic }));
      return data;
    });

  const putAccess = (key, body) =>
    run(key, async () => {
      const data = await apiFetch(`/api/access/users/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setGrants(data);
      return data;
    });

  const coachedTeams = useMemo(
    () =>
      allTeams.filter((team) =>
        (currentUser?.teams ?? []).some(
          (own) => own.id === team.id && own.relationType === 'coach' && own.isConfirmed
        )
      ),
    [allTeams, currentUser]
  );
  const editableTeams = can('members.edit') ? allTeams : coachedTeams;
  const playerTeamIds = (local.teams ?? []).filter((t) => t.relationType === 'player').map((t) => t.id);
  const coachTeams = (local.teams ?? []).filter((t) => t.relationType === 'coach');

  const togglePlayerTeam = (teamId) => {
    const nextIds = playerTeamIds.includes(teamId)
      ? playerTeamIds.filter((id) => id !== teamId)
      : [...playerTeamIds, teamId];
    const nextTeams = [
      ...(local.teams ?? []).filter((t) => t.relationType !== 'player'),
      ...nextIds
        .map((id) => allTeams.find((t) => t.id === id))
        .filter(Boolean)
        .map((t) => ({ ...t, relationType: 'player' })),
    ];
    patch('teams', { teamIds: nextIds }, { teams: nextTeams });
  };

  const toggleService = (service) => {
    const next = local.services.includes(service)
      ? local.services.filter((s) => s !== service)
      : [...local.services, service];
    patch('services', { services: next }, { services: next });
  };

  const assignable = roles.filter((role) => role.assignable);

  return (
    <Modal onClose={onClose} title={`${member.firstName} ${member.lastName}`} size="lg">
      <div className="space-y-5">
        <header className="flex items-center gap-3">
          <Avatar person={local} size="lg" />
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">Mitgliedsnummer #{member.id}</p>
            {local.email && (
              <a href={`mailto:${local.email}`} className="link flex items-center gap-1.5 text-sm">
                <Mail size={14} aria-hidden="true" /> {local.email}
              </a>
            )}
            {local.phone && (
              <a href={`tel:${local.phone}`} className="link flex items-center gap-1.5 text-sm">
                <Phone size={14} aria-hidden="true" /> {local.phone}
              </a>
            )}
          </div>
        </header>

        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <SuccessNote>{notice}</SuccessNote>}

        {/* ---------------------------------------------------------- Konto */}
        <Block title="Konto">
          <div className="flex flex-wrap items-center gap-3">
            {local.isApproved ? (
              <span className="status text-hsg-green-dark">
                <span className="status-dot bg-hsg-green" /> Aktiv
              </span>
            ) : (
              <span className="status text-danger">
                <span className="status-dot bg-danger" /> Gesperrt
              </span>
            )}
            {can('members.lock') && editable && !isSelf && (
              <button
                type="button"
                disabled={busy === 'lock'}
                className={`btn btn-sm ${local.isApproved ? 'btn-danger' : 'btn-primary'}`}
                onClick={async () => {
                  if (
                    local.isApproved &&
                    !(await confirm({
                      title: 'Konto sperren?',
                      text: 'Die Person wird sofort auf allen Geräten abgemeldet.',
                      confirmLabel: 'Sperren',
                      tone: 'danger',
                    }))
                  )
                    return;
                  patch('lock', { isApproved: !local.isApproved }, { isApproved: !local.isApproved });
                }}
              >
                {local.isApproved ? 'Konto sperren' : 'Sperre aufheben'}
              </button>
            )}
          </div>
        </Block>

        {/* --------------------------------------------------------- Rollen */}
        <Block
          title="Rollen"
          hint="Die Grundrolle beschreibt die Person im Verein. Zusatzrollen geben weitere Rechte, z. B. Jugendleitung."
        >
          {can('members.roles') && editable && !isSelf ? (
            <div className="space-y-3">
              <label className="block">
                <span className="field-label">Grundrolle</span>
                <select
                  className="field-control"
                  value={local.role}
                  disabled={busy === 'role'}
                  onChange={(e) => patch('role', { role: e.target.value }, { role: e.target.value })}
                >
                  {roles
                    .filter((role) => role.isSystem && (role.assignable || role.key === local.role))
                    .map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                </select>
              </label>
              <div>
                <span className="field-label">Zusatzrollen</span>
                <div className="flex flex-wrap gap-1.5">
                  {assignable
                    .filter((role) => !role.isSystem && role.key !== local.role)
                    .map((role) => {
                      const active = grants?.extraRoles?.includes(role.key);
                      return (
                        <button
                          key={role.key}
                          type="button"
                          role="checkbox"
                          aria-checked={Boolean(active)}
                          disabled={!grants || busy === 'extra'}
                          title={role.description ?? undefined}
                          className={`chip chip-sm ${active ? 'chip-active' : ''}`}
                          onClick={() => {
                            const next = active
                              ? grants.extraRoles.filter((key) => key !== role.key)
                              : [...grants.extraRoles, role.key];
                            putAccess('extra', { extraRoles: next });
                          }}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              {roleLabel(local.role, roles)}
              {(grants?.extraRoles ?? []).map((key) => ` · ${roleLabel(key, roles)}`)}
              {isSelf && <span className="block text-xs text-ink-muted">Die eigenen Rollen ändert ein anderer Admin.</span>}
              {!isSelf && grants && !editable && (
                <span className="block text-xs text-ink-muted">Admin-Konten bearbeitet nur ein Admin.</span>
              )}
            </p>
          )}
        </Block>

        {/* --------------------------------------------------- Mannschaften */}
        <Block title="Spielt in" hint="Trainer:innen und Fans werden auf der Mannschaftsseite gepflegt.">
          {editableTeams.length > 0 ? (
            <TeamSelect
              teams={editableTeams}
              selectedIds={playerTeamIds}
              onToggle={togglePlayerTeam}
              disabled={busy === 'teams'}
              size="sm"
            />
          ) : (
            <p className="text-sm text-ink-soft">
              {(local.teams ?? []).filter((t) => t.relationType === 'player').map((t) => t.name).join(', ') || '—'}
            </p>
          )}
          {coachTeams.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              {relationLabelPlural('coach')}:{' '}
              {coachTeams.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  <Link to={`/teams/${t.code}`} className="link" onClick={onClose}>
                    {t.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </Block>

        {/* -------------------------------------------------- Helferdienste */}
        {can('members.edit') && (
          <Block title="Helferdienste">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SERVICE_LABELS).map(([key, label]) => {
                const active = local.services.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    disabled={busy === 'services'}
                    onClick={() => toggleService(key)}
                    className={`chip chip-sm ${active ? 'chip-active' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Block>
        )}

        {/* --------------------------------------------------- Einzelrechte */}
        {can('access.manage') && grants && (
          <OverridesBlock
            grants={grants}
            disabled={!editable || isSelf || busy === 'overrides'}
            onSave={(overrides) => putAccess('overrides', { overrides })}
          />
        )}

        {/* ----------------------------------------- Passwort (nur Admins) */}
        {currentUser?.isSuperuser && !isSelf && !local.isManaged && (
          <PasswordResetBlock
            busy={busy === 'password'}
            onSubmit={(newPassword) =>
              run('password', () =>
                apiFetch(`/api/admin/users/${member.id}/password`, {
                  method: 'POST',
                  body: JSON.stringify({ newPassword }),
                })
              )
            }
          />
        )}
      </div>
      {confirmDialog}
    </Modal>
  );
}

/**
 * Passwort-Notfall: Admin setzt ein neues Passwort, z. B. wenn jemand seines
 * vergessen hat. Das Passwort wird hier vorgeschlagen und kann kopiert
 * werden – danach gibt man es der Person persönlich weiter.
 */
function PasswordResetBlock({ busy, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(true);
  const [confirm, confirmDialog] = useConfirm();

  const suggest = () => {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    setValue(Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(''));
    setVisible(true);
  };

  if (!open) {
    return (
      <Block title="Passwort" hint="Nur Admins. Für den Fall, dass jemand sein Passwort vergessen hat.">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            setOpen(true);
            suggest();
          }}
        >
          Neues Passwort setzen
        </button>
      </Block>
    );
  }

  return (
    <Block
      title="Passwort"
      hint="Die Person wird auf allen Geräten abgemeldet. Gib ihr das neue Passwort persönlich weiter – sie kann es danach unter „Mein Konto“ ändern."
    >
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault();
          const confirmed = await confirm({
            title: 'Passwort neu setzen?',
            text: 'Die Person wird auf allen Geräten abgemeldet.',
            confirmLabel: 'Neu setzen',
          });
          if (!confirmed) return;
          const ok = await onSubmit(value);
          if (ok) setOpen(false);
        }}
      >
        <input
          type={visible ? 'text' : 'password'}
          className="field-control min-w-0 flex-1 font-mono"
          value={value}
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          onChange={(e) => setValue(e.target.value)}
          aria-label="Neues Passwort"
        />
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisible((v) => !v)}>
            {visible ? 'Verbergen' : 'Zeigen'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={suggest}>
            Neu würfeln
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || value.length < 8}>
            {busy ? 'Speichert …' : 'Setzen'}
          </button>
        </div>
      </form>
      {confirmDialog}
    </Block>
  );
}

function Block({ title, hint, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-ink-muted">{title}</h3>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </section>
  );
}

/**
 * Einzelrechte: je Recht „wie Rolle“, „erlauben“ oder „entziehen“. Angezeigt
 * wird auch, was am Ende wirklich gilt.
 */
function OverridesBlock({ grants, disabled, onSave }) {
  const { catalog } = useAccess();
  const { can, user } = useAuth();
  const groups = useMemo(() => groupPermissions(catalog), [catalog]);
  const current = useMemo(
    () => new Map((grants.overrides ?? []).map((o) => [o.permission, o.effect])),
    [grants]
  );
  const effective = new Set(grants.permissions ?? []);

  const setEffect = (permission, effect) => {
    const next = new Map(current);
    if (effect === 'inherit') next.delete(permission);
    else next.set(permission, effect);
    onSave([...next].map(([key, value]) => ({ permission: key, effect: value })));
  };

  if (grants.isSuperuser) {
    return (
      <Block title="Einzelrechte">
        <p className="text-sm text-ink-soft">Admin – hat immer alle Rechte.</p>
      </Block>
    );
  }

  return (
    <Block
      title="Einzelrechte"
      hint="Ausnahmen für genau diese Person. „Entziehen“ schlägt jede Rolle. Du kannst nur Rechte vergeben, die du selbst hast."
    >
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-md border border-line">
            <p className="border-b border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted">{group.label}</p>
            <ul className="divide-y divide-line">
              {group.permissions.map((perm) => {
                const value = current.get(perm.key) ?? 'inherit';
                const grantable = user?.isSuperuser || can(perm.key);
                return (
                  <li key={perm.key} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-bold text-ink">
                        {perm.label}
                        <span
                          className={`status-dot ${effective.has(perm.key) ? 'bg-hsg-green' : 'bg-line-strong'}`}
                          title={effective.has(perm.key) ? 'Gilt' : 'Gilt nicht'}
                        />
                      </span>
                      <span className="block text-xs text-ink-muted">{perm.description}</span>
                    </span>
                    <div className="switcher shrink-0" role="radiogroup" aria-label={perm.label}>
                      {[
                        ['inherit', 'Wie Rolle'],
                        ['grant', 'Erlauben'],
                        ['deny', 'Entziehen'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={value === key}
                          disabled={disabled || !grantable}
                          onClick={() => value !== key && setEffect(perm.key, key)}
                          className={`switcher__btn ${value === key ? 'switcher__btn--active' : ''}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Block>
  );
}
