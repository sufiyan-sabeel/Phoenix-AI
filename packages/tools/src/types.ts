export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolContext {
  sessionId: string;
  workingDir: string;
  permissions: string[];
  env: Record<string, string>;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  category: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export type ToolRegistry = Map<string, Tool>;
