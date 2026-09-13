interface PermissionEntry {
  serverId: string;
  toolName?: string;
  actions: string[];
  granted: boolean;
}

const permissions = new Map<string, PermissionEntry[]>();

function permissionKey(serverId: string, toolName?: string): string {
  return toolName ? `${serverId}::${toolName}` : `${serverId}::*`;
}

export function checkPermission(
  serverId: string,
  toolName: string,
  action: string
): boolean {
  const serverPerms = permissions.get(serverId);
  if (!serverPerms) return false;

  for (const entry of serverPerms) {
    if (entry.toolName && entry.toolName !== toolName) continue;
    if (!entry.actions.includes(action) && !entry.actions.includes('*')) continue;
    return entry.granted;
  }

  return false;
}

export function scopeCredential(
  serverId: string,
  scopes: string[]
): void {
  const existing = permissions.get(serverId) || [];
  const wildcardEntry: PermissionEntry = {
    serverId,
    actions: scopes,
    granted: true,
  };

  const filtered = existing.filter(e => e.toolName !== undefined);
  filtered.push(wildcardEntry);
  permissions.set(serverId, filtered);
}

export function grantPermission(
  serverId: string,
  toolName: string | undefined,
  actions: string[]
): void {
  const existing = permissions.get(serverId) || [];
  const entry: PermissionEntry = {
    serverId,
    toolName,
    actions,
    granted: true,
  };

  const key = permissionKey(serverId, toolName);
  const filtered = existing.filter(e => permissionKey(e.serverId, e.toolName) !== key);
  filtered.push(entry);
  permissions.set(serverId, filtered);
}

export function revokePermission(
  serverId: string,
  toolName?: string
): void {
  const existing = permissions.get(serverId) || [];
  const key = permissionKey(serverId, toolName);
  const filtered = existing.filter(e => permissionKey(e.serverId, e.toolName) !== key);
  permissions.set(serverId, filtered);
}

export function listPermissions(serverId?: string): PermissionEntry[] {
  if (serverId) {
    return permissions.get(serverId) || [];
  }
  const all: PermissionEntry[] = [];
  for (const entries of permissions.values()) {
    all.push(...entries);
  }
  return all;
}

export function clearPermissions(serverId: string): void {
  permissions.delete(serverId);
}

export function hasAnyPermission(serverId: string): boolean {
  const serverPerms = permissions.get(serverId);
  return !!serverPerms && serverPerms.length > 0 && serverPerms.some(e => e.granted);
}
