import { useMemo, useState } from 'react';
import { Crown, Lock, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { groupPermissions, useAccess } from '../../hooks/useAccess';
import { formatCount } from '../../lib/format';
import { ErrorNote, Loading, SuccessNote } from './ui/Feedback';
import { useConfirm } from '../../hooks/useConfirm';

/**
 * Rollen & Rechte: Rollen als Bündel einzelner Rechte.
 *
 * Links (am Handy oben) die Rollen, daneben die Rechte der gewählten Rolle,
 * nach Bereichen gruppiert. Systemrollen (Admin, Sub-Admin, Trainer:in,
 * Spieler:in, Zuschauer:in) bleiben bestehen, ihre Rechte sind aber genauso
 * einstellbar – nur die Admin-Rolle hat immer alles.
 *
 * Einzelne Personen bekommen Zusatzrollen und Einzelrechte in der
 * Mitgliederliste („Rechte“ am Mitglied).
 */
export default function RolesSection() {
  const { can, isSuperuser } = useAuthAccess();
  const { catalog, roles, loading, error: loadError, reload } = useAccess();
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);

  const groups = useMemo(() => groupPermissions(catalog), [catalog]);
  // Ohne Auswahl die erste Rolle zeigen – abgeleitet statt per Effekt gesetzt.
  const selected = roles.find((role) => role.id === selectedId) ?? (creating ? null : roles[0] ?? null);
  const canEdit = can('access.manage');


  if (loading) return <Loading>Rollen werden geladen …</Loading>;

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ink-muted">
        Eine Rolle bündelt Rechte. Jede Person hat eine Grundrolle und beliebig viele
        Zusatzrollen – vergeben in der Mitgliederliste. Mannschaftsrechte (Kader, Termine)
        hängen weiter an der Zuordnung als Trainer:in einer Mannschaft.
      </p>

      {(error || loadError) && <ErrorNote>{error ?? loadError}</ErrorNote>}
      {notice && <SuccessNote>{notice}</SuccessNote>}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <section className="panel self-start">
          <div className="panel__header">
            <h2 className="section-title text-base">Rollen</h2>
            {canEdit && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setCreating(true);
                  setSelectedId(null);
                  setNotice(null);
                }}
              >
                <Plus size={14} aria-hidden="true" /> Neu
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(role.id);
                    setCreating(false);
                    setNotice(null);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface ${
                    role.id === selected?.id && !creating ? 'bg-hsg-green-soft' : ''
                  }`}
                  aria-current={role.id === selected?.id && !creating ? 'true' : undefined}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-strong text-ink-soft">
                    {role.isSuperuser ? <Crown size={16} /> : <ShieldCheck size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{role.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {role.isSuperuser
                        ? 'Alle Rechte'
                        : formatCount(role.permissions.length, 'Recht', 'Rechte')}
                      {' · '}
                      {formatCount(role.memberCount, 'Person', 'Personen')}
                    </span>
                  </span>
                  {role.isSystem && (
                    <span className="tag text-[0.65rem]" title="Systemrolle">
                      System
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {creating ? (
          <RoleEditor
            key="new"
            groups={groups}
            role={null}
            canEdit={canEdit}
            isSuperuser={isSuperuser}
            onCancel={() => setCreating(false)}
            onSaved={async (role, message) => {
              await reload();
              setCreating(false);
              setSelectedId(role.id);
              setNotice(message);
            }}
            onError={setError}
          />
        ) : selected ? (
          <RoleEditor
            key={selected.id}
            groups={groups}
            role={selected}
            canEdit={canEdit && selected.assignable}
            isSuperuser={isSuperuser}
            onSaved={async (_role, message) => {
              await reload();
              setNotice(message);
            }}
            onDeleted={async (message) => {
              setSelectedId(null);
              await reload();
              setNotice(message);
            }}
            onError={setError}
          />
        ) : null}
      </div>
    </div>
  );
}

function useAuthAccess() {
  const { can, user } = useAuth();
  return { can, isSuperuser: Boolean(user?.isSuperuser) };
}

function RoleEditor({ role, groups, canEdit, isSuperuser, onSaved, onDeleted, onCancel, onError }) {
  const { can } = useAuth();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState(() => new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const allRights = Boolean(role?.isSuperuser);
  const dirty =
    !role ||
    name !== role.name ||
    (description ?? '') !== (role.description ?? '') ||
    permissions.size !== role.permissions.length ||
    role.permissions.some((perm) => !permissions.has(perm));

  const toggle = (key) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const body = { name, description, ...(allRights ? {} : { permissions: [...permissions] }) };
      const data = role
        ? await apiFetch(`/api/access/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/api/access/roles', { method: 'POST', body: JSON.stringify(body) });
      await onSaved(data.role, data.message);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Rolle „${role.name}“ löschen?`,
      text: 'Personen mit dieser Zusatzrolle verlieren die Rechte daraus.',
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const data = await apiFetch(`/api/access/roles/${role.id}`, { method: 'DELETE' });
      await onDeleted(data.message);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel" onSubmit={save}>
      {confirmDialog}
      <div className="panel__header">
        <h2 className="section-title flex items-center gap-2 text-base">
          {role ? role.name : 'Neue Rolle'}
          {role?.isSystem && <Lock size={14} className="text-ink-muted" aria-label="Systemrolle" />}
        </h2>
        {role && (
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <Users size={14} aria-hidden="true" />
            {formatCount(role.memberCount, 'Person', 'Personen')}
          </span>
        )}
      </div>

      <div className="panel__body space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Name</span>
            <input
              className="field-control"
              value={name}
              maxLength={60}
              required
              disabled={!canEdit}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Beschreibung</span>
            <input
              className="field-control"
              value={description ?? ''}
              maxLength={255}
              disabled={!canEdit}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Wofür ist die Rolle da?"
            />
          </label>
        </div>

        {allRights ? (
          <div className="alert alert-info">
            <Crown size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Die Admin-Rolle hat immer alle Rechte – auch alle, die künftig dazukommen. So kann sich der
            Verein nie aus der eigenen Verwaltung aussperren.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <fieldset key={group.key} className="rounded-md border border-line">
                <legend className="ml-3 px-1 text-xs font-semibold text-ink-muted">
                  {group.label}
                </legend>
                <ul className="divide-y divide-line">
                  {group.permissions.map((perm) => {
                    // Rechte, die man selbst nicht hat, lassen sich nicht vergeben.
                    const grantable = isSuperuser || can(perm.key);
                    return (
                      <li key={perm.key}>
                        <label
                          className={`flex items-start gap-3 px-3 py-2.5 ${
                            canEdit && grantable ? 'cursor-pointer hover:bg-surface' : 'opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 shrink-0 accent-hsg-green"
                            checked={permissions.has(perm.key)}
                            disabled={!canEdit || !grantable}
                            onChange={() => toggle(perm.key)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-ink">{perm.label}</span>
                            <span className="block text-xs text-ink-muted">{perm.description}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        )}

        {!canEdit && role && (
          <p className="text-xs text-ink-muted">
            Diese Rolle kannst du nur ansehen. Ändern darf sie, wer „Rechte verwalten“ hat und
            mindestens alle ihre Rechte besitzt.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
          {role && !role.isSystem && (
            <button type="button" className="btn btn-ghost btn-sm mr-auto text-danger" onClick={remove} disabled={saving}>
              <Trash2 size={14} aria-hidden="true" /> Löschen
            </button>
          )}
          {onCancel && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={saving}>
              Abbrechen
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !dirty || name.trim().length < 2}>
            {saving ? 'Speichert …' : role ? 'Speichern' : 'Rolle anlegen'}
          </button>
        </div>
      )}
    </form>
  );
}
