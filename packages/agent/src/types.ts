import type { ChatModel, ToolDefinition, ToolCall, ChatMessage } from '@phoenix/ai';

export type AgentMode = 'planner' | 'builder' | 'reviewer' | 'tester' | 'debugger';

export interface AgentStep {
  input: string;
  output: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  reasoning: string;
  timestamp: number;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
  error?: string;
}

export interface AgentPlan {
  goal: string;
  steps: AgentStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: number;
  maxSteps: number;
}

export interface StepResult {
  output: string;
  toolCalls: ToolCall[];
  done: boolean;
  error?: string;
}

export interface ModeConfig {
  name: AgentMode;
  systemPrompt: string;
  allowedTools: string[];
  exitCriteria: string;
  maxSteps: number;
}

export interface AgentContext {
  messages: ChatMessage[];
  plan: AgentPlan | null;
  mode: AgentMode;
  availableTools: ToolDefinition[];
  workingMemory: string;
  history: AgentStep[];
}

export interface AgentEngine {
  executeStep(input: string): Promise<StepResult>;
  executePlan(goal: string): Promise<AgentPlan>;
  getMode(): AgentMode;
  setMode(mode: AgentMode): void;
  getTools(): ToolDefinition[];
  getContext(): AgentContext;
}

export interface ToolExecutor {
  execute(name: string, args: Record<string, unknown>): Promise<string>;
}

export interface MemoryStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
