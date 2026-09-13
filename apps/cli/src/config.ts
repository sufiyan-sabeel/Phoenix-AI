import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface PhoenixConfig {
  server: {
    url: string;
    mode: 'local' | 'remote';
    authToken?: string;
  };
  provider: string;
  model: string;
  session: {
    defaultWorkspace?: string;
    autoSave: boolean;
  };
  mcp: {
    servers: Record<string, {
      url: string;
      enabled: boolean;
      headers?: Record<string, string>;
    }>;
  };
  ui: {
    color: boolean;
    streaming: boolean;
    mode?: string;
  };
}

const DEFAULT_CONFIG: PhoenixConfig = {
  server: {
    url: 'http://localhost:3000',
    mode: 'local',
  },
  provider: 'openai',
  model: 'gpt-4o',
  session: {
    autoSave: true,
  },
  mcp: {
    servers: {},
  },
  ui: {
    color: true,
    streaming: true,
  },
};

const CONFIG_DIR = join(homedir(), '.config', 'phoenix');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function readConfig(): PhoenixConfig {
  ensureConfigDir();
  
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return { ...DEFAULT_CONFIG };
  }
  
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PhoenixConfig>;
    return mergeWithDefaults(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: PhoenixConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigValue<T>(path: string): T | undefined {
  const config = readConfig();
  const keys = path.split('.');
  
  let current: unknown = config;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  
  return current as T;
}

export function setConfigValue(path: string, value: unknown): void {
  const config = readConfig();
  const keys = path.split('.');
  
  let current: unknown = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new Error(`Cannot set value at path: ${path}`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  
  const lastKey = keys[keys.length - 1];
  if (current === null || current === undefined || typeof current !== 'object') {
    throw new Error(`Cannot set value at path: ${path}`);
  }
  
  (current as Record<string, unknown>)[lastKey] = parseValue(value);
  writeConfig(config);
}

function parseValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  
  return value;
}

function mergeWithDefaults(partial: Partial<PhoenixConfig>): PhoenixConfig {
  return {
    server: {
      ...DEFAULT_CONFIG.server,
      ...partial.server,
    },
    provider: partial.provider ?? DEFAULT_CONFIG.provider,
    model: partial.model ?? DEFAULT_CONFIG.model,
    session: {
      ...DEFAULT_CONFIG.session,
      ...partial.session,
    },
    mcp: {
      servers: {
        ...DEFAULT_CONFIG.mcp.servers,
        ...partial.mcp?.servers,
      },
    },
    ui: {
      ...DEFAULT_CONFIG.ui,
      ...partial.ui,
    },
  };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function resetConfig(): void {
  writeConfig({ ...DEFAULT_CONFIG });
}
