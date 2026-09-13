import type { AgentMode, Session } from '@phoenix/shared';
import type { EventBus } from './event-bus.js';
import type { SessionManager } from './session.js';

interface ChildSession {
  childSessionId: string;
  parentId: string;
  mode: AgentMode;
  tools: string[];
  task: string;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

interface ParentTracker {
  children: Map<string, ChildSession>;
  totalExpected: number;
  completedCount: number;
  failedCount: number;
}

export class SubagentManager {
  private childToParent = new Map<string, string>();
  private parentTrackers = new Map<string, ParentTracker>();

  constructor(
    private eventBus: EventBus,
    private sessionManager: SessionManager
  ) {}

  spawnSubagent(
    parentId: string,
    mode: AgentMode,
    tools: string[],
    task: string
  ): Session {
    const parentSession = this.sessionManager.getSession(parentId);
    if (!parentSession) {
      throw new Error(`Parent session ${parentId} not found`);
    }

    const childSession = this.sessionManager.createSession(
      parentSession.projectId,
      parentSession.provider,
      parentSession.model
    );

    this.sessionManager.updateSession(childSession.id, { mode });

    this.childToParent.set(childSession.id, parentId);

    const child: ChildSession = {
      childSessionId: childSession.id,
      parentId,
      mode,
      tools,
      task,
      status: 'running',
      createdAt: new Date(),
    };

    let tracker = this.parentTrackers.get(parentId);
    if (!tracker) {
      tracker = {
        children: new Map(),
        totalExpected: 0,
        completedCount: 0,
        failedCount: 0,
      };
      this.parentTrackers.set(parentId, tracker);
    }

    tracker.children.set(childSession.id, child);
    tracker.totalExpected++;

    return childSession;
  }

  reportResult(childId: string, result: any, error?: string): void {
    const parentId = this.childToParent.get(childId);
    if (!parentId) {
      throw new Error(`Child session ${childId} not tracked`);
    }

    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return;

    const child = tracker.children.get(childId);
    if (!child) return;

    child.result = result;
    child.error = error;
    child.completedAt = new Date();

    if (error) {
      child.status = 'failed';
      tracker.failedCount++;
      this.eventBus.emit({
        type: 'tool.failed',
        data: {
          toolCallId: childId,
          sessionId: parentId,
          toolName: `subagent:${child.mode}`,
          error,
        },
      });
    } else {
      child.status = 'completed';
      tracker.completedCount++;
      this.eventBus.emit({
        type: 'tool.completed',
        data: {
          toolCallId: childId,
          sessionId: parentId,
          toolName: `subagent:${child.mode}`,
          duration: child.completedAt.getTime() - child.createdAt.getTime(),
        },
      });
    }
  }

  getSubagents(parentId: string): Session[] {
    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return [];

    const sessions: Session[] = [];
    for (const [childId] of tracker.children) {
      const session = this.sessionManager.getSession(childId);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  getChildInfo(childId: string): ChildSession | undefined {
    const parentId = this.childToParent.get(childId);
    if (!parentId) return undefined;
    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return undefined;
    return tracker.children.get(childId);
  }

  getParentId(childId: string): string | undefined {
    return this.childToParent.get(childId);
  }

  getCompletionStatus(parentId: string): {
    total: number;
    completed: number;
    failed: number;
    allDone: boolean;
  } | undefined {
    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return undefined;

    return {
      total: tracker.totalExpected,
      completed: tracker.completedCount,
      failed: tracker.failedCount,
      allDone:
        tracker.completedCount + tracker.failedCount >= tracker.totalExpected,
    };
  }

  getResultSummary(parentId: string): any[] {
    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return [];

    const results: any[] = [];
    for (const [, child] of tracker.children) {
      results.push({
        childSessionId: child.childSessionId,
        mode: child.mode,
        task: child.task,
        status: child.status,
        result: child.result,
        error: child.error,
        duration: child.completedAt
          ? child.completedAt.getTime() - child.createdAt.getTime()
          : undefined,
      });
    }
    return results;
  }

  cleanup(parentId: string): void {
    const tracker = this.parentTrackers.get(parentId);
    if (!tracker) return;

    for (const [childId] of tracker.children) {
      this.childToParent.delete(childId);
    }
    this.parentTrackers.delete(parentId);
  }
}
