export type PhoenixEvent =
  | { type: 'session.created'; data: SessionCreatedEvent }
  | { type: 'session.updated'; data: SessionUpdatedEvent }
  | { type: 'session.deleted'; data: SessionDeletedEvent }
  | { type: 'message.created'; data: MessageCreatedEvent }
  | { type: 'message.updated'; data: MessageUpdatedEvent }
  | { type: 'tool.executing'; data: ToolExecutingEvent }
  | { type: 'tool.completed'; data: ToolCompletedEvent }
  | { type: 'tool.failed'; data: ToolFailedEvent }
  | { type: 'stream.token'; data: StreamTokenEvent }
  | { type: 'stream.done'; data: StreamDoneEvent }
  | { type: 'memory.updated'; data: MemoryUpdatedEvent }
  | { type: 'connector.status'; data: ConnectorStatusEvent }
  | { type: 'agent.mode.changed'; data: AgentModeChangedEvent }
  | { type: 'error'; data: ErrorEvent };

export interface SessionCreatedEvent {
  sessionId: string;
  userId: string;
  projectId: string;
  provider: string;
  model: string;
}

export interface SessionUpdatedEvent {
  sessionId: string;
  changes: Record<string, any>;
}

export interface SessionDeletedEvent {
  sessionId: string;
}

export interface MessageCreatedEvent {
  messageId: string;
  sessionId: string;
  role: string;
  contentLength: number;
}

export interface MessageUpdatedEvent {
  messageId: string;
  sessionId: string;
  changes: Record<string, any>;
}

export interface ToolExecutingEvent {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, any>;
}

export interface ToolCompletedEvent {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  duration: number;
}

export interface ToolFailedEvent {
  toolCallId: string;
  sessionId: string;
  toolName: string;
  error: string;
}

export interface StreamTokenEvent {
  sessionId: string;
  token: string;
  index: number;
}

export interface StreamDoneEvent {
  sessionId: string;
  totalTokens: number;
}

export interface MemoryUpdatedEvent {
  memoryType: string;
  key: string;
  action: 'created' | 'updated' | 'deleted';
}

export interface ConnectorStatusEvent {
  connectorId: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  error?: string;
}

export interface AgentModeChangedEvent {
  sessionId: string;
  previousMode: string;
  newMode: string;
}

export interface ErrorEvent {
  sessionId?: string;
  code: string;
  message: string;
  recoverable: boolean;
  source?: string;
}
