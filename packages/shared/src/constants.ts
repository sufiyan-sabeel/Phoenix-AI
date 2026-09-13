export const DEFAULT_PORT = 3777;
export const MAX_MESSAGE_LENGTH = 100000;
export const SESSION_TIMEOUT = 3600000;

export const MEMORY_LAYERS = [
  'session',
  'project',
  'preferences',
  'decisions',
  'errors',
  'long-term',
] as const;

export const TOOL_CATEGORIES = [
  'terminal',
  'filesystem',
  'git',
  'adb',
  'mcp',
  'automation',
] as const;

export const AGENT_MODES = [
  'planner',
  'builder',
  'reviewer',
  'tester',
  'debugger',
] as const;

export const PROVIDERS = [
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'ollama',
  'custom',
] as const;

export const PERMISSION_LEVELS = [
  'auto-allow',
  'confirm-once',
  'confirm-every',
] as const;

export const DEFAULT_PERMISSIONS: Record<string, { readOnly: string; write: string; destructive: string }> = {
  terminal: { readOnly: 'confirm-once', write: 'confirm-every', destructive: 'confirm-every' },
  filesystem: { readOnly: 'auto-allow', write: 'confirm-once', destructive: 'confirm-every' },
  git: { readOnly: 'auto-allow', write: 'confirm-once', destructive: 'confirm-every' },
  adb: { readOnly: 'confirm-once', write: 'confirm-every', destructive: 'confirm-every' },
  mcp: { readOnly: 'confirm-once', write: 'confirm-every', destructive: 'confirm-every' },
  automation: { readOnly: 'confirm-once', write: 'confirm-every', destructive: 'confirm-every' },
};

export const STREAM_EVENT_TYPES = [
  'token',
  'tool_call',
  'tool_result',
  'error',
  'done',
  'status',
] as const;
