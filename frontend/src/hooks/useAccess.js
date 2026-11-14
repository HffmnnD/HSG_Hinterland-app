import { useCallback } from 'react';

import { useApiResource } from './useSchedule';

const selectCatalog = (result) => result ?? null;
const selectRoles = (result) => result?.roles ?? [];
const NO_ROLES = [];

/**
 * Rechte-Katalog und Rollen aus /api/access.
 *
 *   catalog  { groups:[{key,label}], permissions:[{key,group,label,description}] }
 *   roles    [{ id, key, name, description, isSystem, isSuperuser,
 *               permissions:[], memberCount, assignable }]
 */
export function useAccess() {
  const catalog = useApiResource('/api/access/catalog', selectCatalog, null);
  const roles = useApiResource('/api/access/roles', selectRoles, NO_ROLES);
  const reloadRoles = roles.reload;

  const reload = useCallback(() => reloadRoles(), [reloadRoles]);

  return {
    catalog: catalog.data,
    roles: roles.data,
    loading: catalog.loading || roles.loading,
    error: catalog.error ?? roles.error,
    reload,
  };
}

/** Rechte nach Gruppen ordnen: [{ key, label, permissions:[…] }]. */
export function groupPermissions(catalog) {
  if (!catalog) return [];
  return catalog.groups
    .map((group) => ({
      ...group,
      permissions: catalog.permissions.filter((perm) => perm.group === group.key),
    }))
    .filter((group) => group.permissions.length > 0);
}
