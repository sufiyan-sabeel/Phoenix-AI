export type MemoryLayer =
  | 'session'
  | 'project'
  | 'preferences'
  | 'decisions'
  | 'errors'
  | 'long-term';

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  key: string;
  value: unknown;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryStore {
  get(layer: MemoryLayer, key: string): MemoryEntry | undefined;
  set(
    layer: MemoryLayer,
    key: string,
    value: unknown,
    metadata?: Record<string, unknown>
  ): MemoryEntry;
  delete(layer: MemoryLayer, key: string): boolean;
  list(layer: MemoryLayer): MemoryEntry[];
  search(query: string, layers?: MemoryLayer[]): MemoryEntry[];
  clear(layer?: MemoryLayer): void;
  has(layer: MemoryLayer, key: string): boolean;
  size(layer?: MemoryLayer): number;
}

export interface LayerManager {
  readonly layer: MemoryLayer;
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T, metadata?: Record<string, unknown>): void;
  delete(key: string): boolean;
  list(): MemoryEntry[];
  search(query: string): MemoryEntry[];
  clear(): void;
}

export interface MemoryContext {
  sessionId: string;
  projectId: string;
  session: Record<string, unknown>;
  project: Record<string, unknown>;
  preferences: Record<string, unknown>;
  decisions: Record<string, unknown>;
  errors: Record<string, unknown>;
  longTerm: Record<string, unknown>;
}

export interface MemoryExport {
  projectId: string;
  exportedAt: Date;
  layers: Record<MemoryLayer, MemoryEntry[]>;
}