export type TriggerType = 'webhook' | 'schedule' | 'command';

export interface Trigger {
  type: TriggerType;
  config: WebhookConfig | ScheduleConfig | CommandConfig;
}

export interface WebhookConfig {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
  headers?: Record<string, string>;
}

export interface ScheduleConfig {
  interval: number;
  cron?: string;
  timezone?: string;
}

export interface CommandConfig {
  command: string;
  description?: string;
  args?: string[];
}

export type StepType = 'mcp_call' | 'tool_call' | 'condition';

export interface WorkflowStep {
  type: StepType;
  config: MCPCallConfig | ToolCallConfig | ConditionConfig;
  onError?: 'stop' | 'continue' | 'retry';
  retryCount?: number;
  retryDelay?: number;
}

export interface MCPCallConfig {
  server: string;
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
}

export interface ToolCallConfig {
  tool: string;
  args: Record<string, unknown>;
  timeout?: number;
}

export interface ConditionConfig {
  expression: string;
  trueStep?: string;
  falseStep?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  steps: WorkflowStep[];
  enabled: boolean;
  lastRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRunResult {
  workflowId: string;
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  stepResults: StepResult[];
  error?: string;
}

export interface StepResult {
  stepIndex: number;
  type: StepType;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  duration: number;
}

export interface ZapierAction {
  app: string;
  action: string;
  selectedApi: string;
  toolName: string;
  params: Record<string, unknown>;
}

export interface ZapierConfig {
  serverUrl: string;
  apiKey?: string;
}