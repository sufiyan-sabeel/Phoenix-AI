export type Provider = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom';

export type AgentMode = 'planner' | 'builder' | 'reviewer' | 'tester' | 'debugger';

export type PermissionLevel = 'auto-allow' | 'confirm-once' | 'confirm-every';

export type ToolCategory = 'terminal' | 'filesystem' | 'git' | 'adb' | 'mcp' | 'automation';

export interface ToolPermission {
  category: ToolCategory;
  readOnly: PermissionLevel;
  write: PermissionLevel;
  destructive: PermissionLevel;
}

export interface Session {
  id: string;
  userId: string;
  projectId: string;
  mode: AgentMode;
  provider: Provider;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

export interface MemoryEntry {
  id: string;
  type: 'session' | 'project' | 'preferences' | 'decisions' | 'errors' | 'long-term';
  key: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  authType: string;
  credentials: Record<string, string>;
  scopes: string[];
  enabled: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  trigger: string;
  steps: WorkflowStep[];
  enabled: boolean;
}

export interface WorkflowStep {
  id: string;
  type: string;
  config: Record<string, any>;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface StreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'status';
  data: any;
}

export interface SubagentSpawnOptions {
  parentSessionId: string;
  mode: AgentMode;
  tools: string[];
  task: string;
}

export interface SubagentResult {
  childSessionId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface PermissionDecision {
  sessionId: string;
  toolCategory: ToolCategory;
  action: string;
  allowed: boolean;
  needsConfirm: boolean;
  timestamp: Date;
}

export interface PermissionOverride {
  category: ToolCategory;
  action?: string;
  level: PermissionLevel;
}

export interface AuditEntry {
  id: string;
  sessionId: string;
  toolCategory: ToolCategory;
  action: string;
  allowed: boolean;
  needsConfirm: boolean;
  timestamp: Date;
}

export interface AgentEngine {
  processMessage(message: string, context: AgentContext): AsyncGenerator<StreamEvent>;
  switchMode(mode: AgentMode): void;
  getCurrentMode(): AgentMode;
}

export interface AgentContext {
  sessionId: string;
  mode: AgentMode;
  provider: Provider;
  model: string;
  availableTools: string[];
}

export interface ToolRegistry {
  getTools(category?: ToolCategory): ToolDefinition[];
  getTool(name: string): ToolDefinition | undefined;
  registerTool(tool: ToolDefinition): void;
}

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  parameters: Record<string, any>;
  readOnly: boolean;
  destructive: boolean;
  execute: (args: Record<string, any>, context: ExecutionContext) => Promise<any>;
}

export interface ExecutionContext {
  sessionId: string;
  workingDirectory: string;
  environment: Record<string, string>;
}

export interface MemoryStore {
  get(type: MemoryEntry['type'], key: string): Promise<MemoryEntry | null>;
  set(type: MemoryEntry['type'], key: string, value: any): Promise<MemoryEntry>;
  delete(type: MemoryEntry['type'], key: string): Promise<void>;
  list(type: MemoryEntry['type']): Promise<MemoryEntry[]>;
  search(query: string): Promise<MemoryEntry[]>;
}
