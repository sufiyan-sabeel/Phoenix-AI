import { z } from 'zod';

export const ProviderSchema = z.enum(['gemini', 'openai', 'anthropic', 'openrouter', 'ollama', 'custom']);

export const AgentModeSchema = z.enum(['planner', 'builder', 'reviewer', 'tester', 'debugger']);

export const PermissionLevelSchema = z.enum(['auto-allow', 'confirm-once', 'confirm-every']);

export const ToolCategorySchema = z.enum(['terminal', 'filesystem', 'git', 'adb', 'mcp', 'automation']);

export const ToolPermissionSchema = z.object({
  category: ToolCategorySchema,
  readOnly: PermissionLevelSchema,
  write: PermissionLevelSchema,
  destructive: PermissionLevelSchema,
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  projectId: z.string().uuid(),
  mode: AgentModeSchema,
  provider: ProviderSchema,
  model: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  path: z.string(),
  createdAt: z.coerce.date(),
});

export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  args: z.record(z.any()),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  result: z.any().optional(),
  error: z.string().optional(),
});

export const ToolResultSchema = z.object({
  toolCallId: z.string().uuid(),
  content: z.string(),
  isError: z.boolean(),
});

export const MessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().max(100000),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
  createdAt: z.coerce.date(),
});

export const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['session', 'project', 'preferences', 'decisions', 'errors', 'long-term']),
  key: z.string().min(1),
  value: z.any(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ConnectorConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: z.string().min(1),
  endpoint: z.string().url(),
  authType: z.string().min(1),
  credentials: z.record(z.string()),
  scopes: z.array(z.string()),
  enabled: z.boolean(),
});

export const WorkflowStepSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  config: z.record(z.any()),
});

export const WorkflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  trigger: z.string().min(1),
  steps: z.array(WorkflowStepSchema),
  enabled: z.boolean(),
});

export const VoiceStateSchema = z.enum(['idle', 'listening', 'processing', 'speaking', 'error']);

export const StreamEventSchema = z.object({
  type: z.enum(['token', 'tool_call', 'tool_result', 'error', 'done', 'status']),
  data: z.any(),
});

export const SessionCreatedEventSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string(),
  projectId: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
});

export const SessionUpdatedEventSchema = z.object({
  sessionId: z.string().uuid(),
  changes: z.record(z.any()),
});

export const SessionDeletedEventSchema = z.object({
  sessionId: z.string().uuid(),
});

export const MessageCreatedEventSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: z.string(),
  contentLength: z.number().int().nonnegative(),
});

export const MessageUpdatedEventSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().uuid(),
  changes: z.record(z.any()),
});

export const ToolExecutingEventSchema = z.object({
  toolCallId: z.string().uuid(),
  sessionId: z.string().uuid(),
  toolName: z.string(),
  args: z.record(z.any()),
});

export const ToolCompletedEventSchema = z.object({
  toolCallId: z.string().uuid(),
  sessionId: z.string().uuid(),
  toolName: z.string(),
  duration: z.number().nonnegative(),
});

export const ToolFailedEventSchema = z.object({
  toolCallId: z.string().uuid(),
  sessionId: z.string().uuid(),
  toolName: z.string(),
  error: z.string(),
});

export const StreamTokenEventSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string(),
  index: z.number().int().nonnegative(),
});

export const StreamDoneEventSchema = z.object({
  sessionId: z.string().uuid(),
  totalTokens: z.number().int().nonnegative(),
});

export const MemoryUpdatedEventSchema = z.object({
  memoryType: z.string(),
  key: z.string(),
  action: z.enum(['created', 'updated', 'deleted']),
});

export const ConnectorStatusEventSchema = z.object({
  connectorId: z.string().uuid(),
  name: z.string(),
  status: z.enum(['connected', 'disconnected', 'error']),
  error: z.string().optional(),
});

export const AgentModeChangedEventSchema = z.object({
  sessionId: z.string().uuid(),
  previousMode: z.string(),
  newMode: z.string(),
});

export const ErrorEventSchema = z.object({
  sessionId: z.string().uuid().optional(),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
  source: z.string().optional(),
});

export const PhoenixEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.created'), data: SessionCreatedEventSchema }),
  z.object({ type: z.literal('session.updated'), data: SessionUpdatedEventSchema }),
  z.object({ type: z.literal('session.deleted'), data: SessionDeletedEventSchema }),
  z.object({ type: z.literal('message.created'), data: MessageCreatedEventSchema }),
  z.object({ type: z.literal('message.updated'), data: MessageUpdatedEventSchema }),
  z.object({ type: z.literal('tool.executing'), data: ToolExecutingEventSchema }),
  z.object({ type: z.literal('tool.completed'), data: ToolCompletedEventSchema }),
  z.object({ type: z.literal('tool.failed'), data: ToolFailedEventSchema }),
  z.object({ type: z.literal('stream.token'), data: StreamTokenEventSchema }),
  z.object({ type: z.literal('stream.done'), data: StreamDoneEventSchema }),
  z.object({ type: z.literal('memory.updated'), data: MemoryUpdatedEventSchema }),
  z.object({ type: z.literal('connector.status'), data: ConnectorStatusEventSchema }),
  z.object({ type: z.literal('agent.mode.changed'), data: AgentModeChangedEventSchema }),
  z.object({ type: z.literal('error'), data: ErrorEventSchema }),
]);

export const createSessionInputSchema = z.object({
  projectId: z.string().uuid(),
  provider: ProviderSchema,
  model: z.string().min(1),
});

export const updateSessionInputSchema = z.object({
  mode: AgentModeSchema.optional(),
  provider: ProviderSchema.optional(),
  model: z.string().min(1).optional(),
});

export const permissionOverrideSchema = z.object({
  category: ToolCategorySchema,
  action: z.string().optional(),
  level: PermissionLevelSchema,
});

export const subagentSpawnSchema = z.object({
  parentSessionId: z.string().uuid(),
  mode: AgentModeSchema,
  tools: z.array(z.string()),
  task: z.string().min(1),
});
