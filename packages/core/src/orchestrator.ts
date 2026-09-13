import type {
  StreamEvent,
  AgentMode,
  Session,
  Message,
  ToolCall,
  ToolCategory,
} from '@phoenix/shared';
import { PhoenixError, PhoenixErrorCode } from '@phoenix/shared';
import type { EventBus } from './event-bus.js';
import type { SessionManager } from './session.js';
import type { PermissionSystem } from './permissions.js';
import type { SubagentManager } from './subagent.js';
import type { AgentEngine } from '@phoenix/shared';
import type { ToolRegistry } from '@phoenix/shared';
import type { MemoryStore } from '@phoenix/shared';
import { randomUUID } from 'node:crypto';

export interface OrchestratorDeps {
  eventBus: EventBus;
  sessionManager: SessionManager;
  agentEngine: AgentEngine;
  toolRegistry: ToolRegistry;
  memoryStore: MemoryStore;
  permissionSystem: PermissionSystem;
  subagentManager: SubagentManager;
}

export interface OrchestratorMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: Array<{ toolCallId: string; content: string; isError: boolean }>;
  createdAt: Date;
}

export class Orchestrator {
  private eventBus: EventBus;
  private sessionManager: SessionManager;
  private agentEngine: AgentEngine;
  private toolRegistry: ToolRegistry;
  private memoryStore: MemoryStore;
  private permissionSystem: PermissionSystem;
  private subagentManager: SubagentManager;
  private messages = new Map<string, OrchestratorMessage[]>();
  private streaming = new Map<string, boolean>();

  constructor(deps: OrchestratorDeps) {
    this.eventBus = deps.eventBus;
    this.sessionManager = deps.sessionManager;
    this.agentEngine = deps.agentEngine;
    this.toolRegistry = deps.toolRegistry;
    this.memoryStore = deps.memoryStore;
    this.permissionSystem = deps.permissionSystem;
    this.subagentManager = deps.subagentManager;
  }

  async *processMessage(sessionId: string, content: string): AsyncGenerator<StreamEvent> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new PhoenixError(
        PhoenixErrorCode.SESSION_NOT_FOUND,
        `Session ${sessionId} not found`,
        false
      );
    }

    if (this.streaming.get(sessionId)) {
      throw new PhoenixError(
        PhoenixErrorCode.INTERNAL_ERROR,
        `Session ${sessionId} is already processing a message`,
        false
      );
    }

    this.streaming.set(sessionId, true);

    const userMessage: OrchestratorMessage = {
      id: randomUUID(),
      sessionId,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    this.addMessage(sessionId, userMessage);

    this.eventBus.emit({
      type: 'message.created',
      data: {
        messageId: userMessage.id,
        sessionId,
        role: 'user',
        contentLength: content.length,
      },
    });

    yield { type: 'status', data: { status: 'processing', sessionId } };

    try {
      const context = {
        sessionId,
        mode: session.mode,
        provider: session.provider,
        model: session.model,
        availableTools: this.toolRegistry.getTools().map(t => t.name),
      };

      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      const tokenCount = { value: 0 };

      const stream = this.agentEngine.processMessage(content, context);

      for await (const event of stream) {
        switch (event.type) {
          case 'token': {
            fullContent += event.data.token;
            tokenCount.value++;
            yield event;
            break;
          }
          case 'tool_call': {
            const toolCall: ToolCall = {
              id: randomUUID(),
              name: event.data.name,
              args: event.data.args || {},
              status: 'pending',
            };

            toolCalls.push(toolCall);

            yield {
              type: 'tool_call',
              data: {
                toolCallId: toolCall.id,
                sessionId,
                toolName: toolCall.name,
                args: toolCall.args,
              },
            };

            const toolResult = await this.executeTool(sessionId, toolCall);
            yield {
              type: 'tool_result',
              data: {
                toolCallId: toolCall.id,
                sessionId,
                content: toolResult.content,
                isError: toolResult.isError,
              },
            };
            break;
          }
          case 'error': {
            yield event;
            break;
          }
          case 'done': {
            break;
          }
          default: {
            yield event;
            break;
          }
        }
      }

      const assistantMessage: OrchestratorMessage = {
        id: randomUUID(),
        sessionId,
        role: 'assistant',
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        createdAt: new Date(),
      };

      this.addMessage(sessionId, assistantMessage);

      this.eventBus.emit({
        type: 'message.created',
        data: {
          messageId: assistantMessage.id,
          sessionId,
          role: 'assistant',
          contentLength: fullContent.length,
        },
      });

      this.eventBus.emit({
        type: 'stream.done',
        data: {
          sessionId,
          totalTokens: tokenCount.value,
        },
      });

      yield {
        type: 'done',
        data: {
          messageId: assistantMessage.id,
          content: fullContent,
          totalTokens: tokenCount.value,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      this.eventBus.emit({
        type: 'error',
        data: {
          sessionId,
          code: PhoenixErrorCode.INTERNAL_ERROR,
          message: error.message,
          recoverable: true,
          source: 'orchestrator',
        },
      });

      yield {
        type: 'error',
        data: {
          code: PhoenixErrorCode.INTERNAL_ERROR,
          message: error.message,
          recoverable: true,
        },
      };
    } finally {
      this.streaming.set(sessionId, false);
    }
  }

  private async executeTool(
    sessionId: string,
    toolCall: ToolCall
  ): Promise<{ content: string; isError: boolean }> {
    const tool = this.toolRegistry.getTool(toolCall.name);
    if (!tool) {
      toolCall.status = 'failed';
      toolCall.error = `Tool '${toolCall.name}' not found`;

      this.eventBus.emit({
        type: 'tool.failed',
        data: {
          toolCallId: toolCall.id,
          sessionId,
          toolName: toolCall.name,
          error: toolCall.error,
        },
      });

      return { content: toolCall.error, isError: true };
    }

    const actionType = tool.destructive
      ? 'destructive'
      : tool.readOnly
        ? 'readOnly'
        : 'write';

    const permission = this.permissionSystem.checkPermission(
      tool.category,
      actionType,
      sessionId
    );

    if (!permission.allowed) {
      toolCall.status = 'failed';
      toolCall.error = `Permission denied for tool '${toolCall.name}' (category: ${tool.category}, action: ${actionType})`;

      this.eventBus.emit({
        type: 'tool.failed',
        data: {
          toolCallId: toolCall.id,
          sessionId,
          toolName: toolCall.name,
          error: toolCall.error,
        },
      });

      return { content: toolCall.error, isError: true };
    }

    if (permission.needsConfirm) {
      yield {
        type: 'status',
        data: {
          status: 'confirm_required',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          category: tool.category,
          actionType,
        },
      };

      this.permissionSystem.confirmOnce(sessionId, tool.category, actionType);
    }

    toolCall.status = 'running';
    const startTime = Date.now();

    this.eventBus.emit({
      type: 'tool.executing',
      data: {
        toolCallId: toolCall.id,
        sessionId,
        toolName: toolCall.name,
        args: toolCall.args,
      },
    });

    try {
      const session = this.sessionManager.getSession(sessionId);
      const result = await tool.execute(toolCall.args, {
        sessionId,
        workingDirectory: session?.projectId ?? '.',
        environment: process.env as Record<string, string>,
      });

      const duration = Date.now() - startTime;
      toolCall.status = 'completed';
      toolCall.result = result;

      this.eventBus.emit({
        type: 'tool.completed',
        data: {
          toolCallId: toolCall.id,
          sessionId,
          toolName: toolCall.name,
          duration,
        },
      });

      return {
        content: typeof result === 'string' ? result : JSON.stringify(result),
        isError: false,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const duration = Date.now() - startTime;
      toolCall.status = 'failed';
      toolCall.error = error.message;

      this.eventBus.emit({
        type: 'tool.failed',
        data: {
          toolCallId: toolCall.id,
          sessionId,
          toolName: toolCall.name,
          error: error.message,
        },
      });

      return { content: error.message, isError: true };
    }
  }

  switchMode(sessionId: string, mode: AgentMode): void {
    this.sessionManager.updateSession(sessionId, { mode });
    this.agentEngine.switchMode(mode);
  }

  spawnSubagent(
    parentSessionId: string,
    mode: AgentMode,
    tools: string[],
    task: string
  ): Session {
    const session = this.subagentManager.spawnSubagent(
      parentSessionId,
      mode,
      tools,
      task
    );

    this.eventBus.emit({
      type: 'status',
      data: {
        status: 'subagent_spawned',
        parentSessionId,
        childSessionId: session.id,
        mode,
        task,
      },
    });

    return session;
  }

  getMessages(sessionId: string): OrchestratorMessage[] {
    return this.messages.get(sessionId) ?? [];
  }

  private addMessage(sessionId: string, message: OrchestratorMessage): void {
    let sessionMessages = this.messages.get(sessionId);
    if (!sessionMessages) {
      sessionMessages = [];
      this.messages.set(sessionId, sessionMessages);
    }
    sessionMessages.push(message);
  }
}
