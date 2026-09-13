import { randomUUID } from 'node:crypto';
import type {
  ToolCategory,
  PermissionLevel,
  PermissionOverride,
  AuditEntry,
} from '@phoenix/shared';
import { DEFAULT_PERMISSIONS } from '@phoenix/shared';

interface PermissionCheckResult {
  allowed: boolean;
  needsConfirm: boolean;
}

interface SessionPermissions {
  overrides: Map<string, PermissionOverride>;
  confirmedOnce: Set<string>;
  auditLog: AuditEntry[];
}

export class PermissionSystem {
  private sessionPermissions = new Map<string, SessionPermissions>();

  private getSessionPermissions(sessionId: string): SessionPermissions {
    let perms = this.sessionPermissions.get(sessionId);
    if (!perms) {
      perms = {
        overrides: new Map(),
        confirmedOnce: new Set(),
        auditLog: [],
      };
      this.sessionPermissions.set(sessionId, perms);
    }
    return perms;
  }

  private getDefaultLevel(
    category: ToolCategory,
    action: 'readOnly' | 'write' | 'destructive'
  ): PermissionLevel {
    const defaults = DEFAULT_PERMISSIONS[category];
    if (!defaults) return 'confirm-every';
    return defaults[action] as PermissionLevel;
  }

  private resolveLevel(
    category: ToolCategory,
    action: 'readOnly' | 'write' | 'destructive',
    sessionId: string
  ): PermissionLevel {
    const perms = this.getSessionPermissions(sessionId);

    const overrideKey = `${category}:${action}`;
    const override = perms.overrides.get(overrideKey);
    if (override) return override.level;

    const categoryOverride = perms.overrides.get(category);
    if (categoryOverride) return categoryOverride.level;

    return this.getDefaultLevel(category, action);
  }

  checkPermission(
    toolCategory: ToolCategory,
    action: string,
    sessionId: string
  ): PermissionCheckResult {
    const actionType = this.classifyAction(toolCategory, action);
    const level = this.resolveLevel(toolCategory, actionType, sessionId);
    const perms = this.getSessionPermissions(sessionId);
    const confirmKey = `${toolCategory}:${actionType}`;

    let allowed = false;
    let needsConfirm = false;

    switch (level) {
      case 'auto-allow':
        allowed = true;
        needsConfirm = false;
        break;
      case 'confirm-once':
        if (perms.confirmedOnce.has(confirmKey)) {
          allowed = true;
          needsConfirm = false;
        } else {
          allowed = true;
          needsConfirm = true;
        }
        break;
      case 'confirm-every':
        allowed = true;
        needsConfirm = true;
        break;
    }

    const auditEntry: AuditEntry = {
      id: randomUUID(),
      sessionId,
      toolCategory,
      action,
      allowed,
      needsConfirm,
      timestamp: new Date(),
    };
    perms.auditLog.push(auditEntry);

    return { allowed, needsConfirm };
  }

  confirmOnce(sessionId: string, category: ToolCategory, actionType: 'readOnly' | 'write' | 'destructive'): void {
    const perms = this.getSessionPermissions(sessionId);
    perms.confirmedOnce.add(`${category}:${actionType}`);
  }

  setOverride(sessionId: string, override: PermissionOverride): void {
    const perms = this.getSessionPermissions(sessionId);
    const key = override.action
      ? `${override.category}:${override.action}`
      : override.category;
    perms.overrides.set(key, override);
  }

  removeOverride(sessionId: string, category: ToolCategory, action?: string): void {
    const perms = this.getSessionPermissions(sessionId);
    const key = action ? `${category}:${action}` : category;
    perms.overrides.delete(key);
  }

  getAuditLog(sessionId: string): AuditEntry[] {
    const perms = this.sessionPermissions.get(sessionId);
    return perms ? [...perms.auditLog] : [];
  }

  clearSession(sessionId: string): void {
    this.sessionPermissions.delete(sessionId);
  }

  private classifyAction(
    category: ToolCategory,
    action: string
  ): 'readOnly' | 'write' | 'destructive' {
    const destructiveActions: Record<string, string[]> = {
      terminal: ['rm', 'rmdir', 'kill', 'shutdown', 'reboot', 'mkfs', 'format', 'dd'],
      filesystem: ['delete', 'unlink', 'rmdir', 'chmod', 'chown', 'truncate'],
      git: ['push', 'force-push', 'reset', 'rebase', 'clean', 'branch -D'],
      adb: ['uninstall', 'reboot', 'shell rm', 'shell rm -rf'],
      mcp: ['delete', 'remove', 'revoke'],
      automation: ['delete', 'destroy', 'disable', 'stop'],
    };

    const readOnlyPatterns: Record<string, string[]> = {
      terminal: ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'echo', 'pwd', 'which', 'whoami'],
      filesystem: ['read', 'exists', 'stat', 'list', 'get', 'info'],
      git: ['status', 'log', 'diff', 'show', 'branch -l', 'remote -v'],
      adb: ['devices', 'shell ls', 'shell cat', 'shell getprop', 'pull'],
      mcp: ['list', 'get', 'read', 'search', 'query'],
      automation: ['list', 'get', 'status', 'query', 'read'],
    };

    const actionLower = action.toLowerCase();

    const destructive = destructiveActions[category];
    if (destructive) {
      for (const pattern of destructive) {
        if (actionLower.includes(pattern)) return 'destructive';
      }
    }

    const readOnly = readOnlyPatterns[category];
    if (readOnly) {
      for (const pattern of readOnly) {
        if (actionLower.includes(pattern)) return 'readOnly';
      }
    }

    return 'write';
  }
}
