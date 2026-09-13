import { randomUUID } from 'node:crypto';
import type { Session, AgentMode, Provider } from '@phoenix/shared';
import { PhoenixError, PhoenixErrorCode } from '@phoenix/shared';
import type { EventBus } from './event-bus.js';

export class SessionManager {
  private sessions = new Map<string, Session>();
  private projectSessions = new Map<string, Set<string>>();

  constructor(private eventBus: EventBus) {}

  createSession(projectId: string, provider: Provider, model: string): Session {
    const id = randomUUID();
    const now = new Date();
    const session: Session = {
      id,
      userId: 'default',
      projectId,
      mode: 'planner',
      provider,
      model,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);

    let projectSessionSet = this.projectSessions.get(projectId);
    if (!projectSessionSet) {
      projectSessionSet = new Set();
      this.projectSessions.set(projectId, projectSessionSet);
    }
    projectSessionSet.add(id);

    this.eventBus.emit({
      type: 'session.created',
      data: {
        sessionId: id,
        userId: session.userId,
        projectId,
        provider,
        model,
      },
    });

    return session;
  }

  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null;
  }

  updateSession(id: string, partial: Partial<Pick<Session, 'mode' | 'provider' | 'model'>>): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new PhoenixError(
        PhoenixErrorCode.SESSION_NOT_FOUND,
        `Session ${id} not found`,
        false
      );
    }

    const previousMode = session.mode;

    if (partial.mode !== undefined) session.mode = partial.mode;
    if (partial.provider !== undefined) session.provider = partial.provider;
    if (partial.model !== undefined) session.model = partial.model;
    session.updatedAt = new Date();

    if (partial.mode && partial.mode !== previousMode) {
      this.eventBus.emit({
        type: 'agent.mode.changed',
        data: {
          sessionId: id,
          previousMode,
          newMode: partial.mode,
        },
      });
    }

    this.eventBus.emit({
      type: 'session.updated',
      data: {
        sessionId: id,
        changes: partial,
      },
    });

    return session;
  }

  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new PhoenixError(
        PhoenixErrorCode.SESSION_NOT_FOUND,
        `Session ${id} not found`,
        false
      );
    }

    this.sessions.delete(id);

    const projectSessionSet = this.projectSessions.get(session.projectId);
    if (projectSessionSet) {
      projectSessionSet.delete(id);
      if (projectSessionSet.size === 0) {
        this.projectSessions.delete(session.projectId);
      }
    }

    this.eventBus.emit({
      type: 'session.deleted',
      data: { sessionId: id },
    });
  }

  listSessions(projectId: string): Session[] {
    const sessionIds = this.projectSessions.get(projectId);
    if (!sessionIds) return [];

    return [...sessionIds]
      .map(id => this.sessions.get(id))
      .filter((s): s is Session => s !== undefined);
  }

  listAllSessions(): Session[] {
    return [...this.sessions.values()];
  }
}
