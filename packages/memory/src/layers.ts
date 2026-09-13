import type {
  MemoryLayer,
  MemoryEntry,
  MemoryStore,
  LayerManager,
} from './types.js';

export class BaseLayerManager implements LayerManager {
  readonly layer: MemoryLayer;

  constructor(
    protected readonly store: MemoryStore,
    layer: MemoryLayer
  ) {
    this.layer = layer;
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(this.layer, key);
    return entry?.value as T | undefined;
  }

  set<T = unknown>(key: string, value: T, metadata?: Record<string, unknown>): void {
    this.store.set(this.layer, key, value, metadata);
  }

  delete(key: string): boolean {
    return this.store.delete(this.layer, key);
  }

  list(): MemoryEntry[] {
    return this.store.list(this.layer);
  }

  search(query: string): MemoryEntry[] {
    return this.store.search(query, [this.layer]);
  }

  clear(): void {
    this.store.clear(this.layer);
  }
}

export class SessionMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'session');
  }

  getState(): Record<string, unknown> {
    const entries = this.list();
    const state: Record<string, unknown> = {};
    for (const entry of entries) {
      state[entry.key] = entry.value;
    }
    return state;
  }

  setCurrentTool(toolName: string | null): void {
    if (toolName === null) {
      this.delete('_currentTool');
    } else {
      this.set('_currentTool', toolName);
    }
  }

  getCurrentTool(): string | undefined {
    return this.get<string>('_currentTool');
  }

  setConversationTurn(turn: number): void {
    this.set('_turn', turn);
  }

  getConversationTurn(): number {
    return this.get<number>('_turn') ?? 0;
  }

  addMessage(role: string, content: string): void {
    const messages = this.get<Array<{ role: string; content: string; timestamp: number }>>('_messages') ?? [];
    messages.push({ role, content, timestamp: Date.now() });
    this.set('_messages', messages);
  }

  getMessages(): Array<{ role: string; content: string; timestamp: number }> {
    return this.get('_messages') ?? [];
  }
}

export class ProjectMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'project');
  }

  setRepoPath(path: string): void {
    this.set('repoPath', path);
  }

  getRepoPath(): string | undefined {
    return this.get<string>('repoPath');
  }

  setProjectName(name: string): void {
    this.set('projectName', name);
  }

  getProjectName(): string | undefined {
    return this.get<string>('projectName');
  }

  addFileFact(filePath: string, fact: Record<string, unknown>): void {
    const facts = this.get<Record<string, Record<string, unknown>>>('fileFacts') ?? {};
    facts[filePath] = { ...facts[filePath], ...fact, updatedAt: Date.now() };
    this.set('fileFacts', facts);
  }

  getFileFacts(filePath: string): Record<string, unknown> | undefined {
    const facts = this.get<Record<string, Record<string, unknown>>>('fileFacts');
    return facts?.[filePath];
  }

  setBuildConfig(config: Record<string, unknown>): void {
    this.set('buildConfig', config);
  }

  getBuildConfig(): Record<string, unknown> | undefined {
    return this.get('buildConfig');
  }

  addDependency(name: string, version: string, type: 'production' | 'dev'): void {
    const deps = this.get<Record<string, { version: string; type: string }>>('dependencies') ?? {};
    deps[name] = { version, type };
    this.set('dependencies', deps);
  }

  getDependencies(): Record<string, { version: string; type: string }> {
    return this.get('dependencies') ?? {};
  }
}

export class PreferencesMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'preferences');
  }

  set<T>(key: string, value: T): void {
    this.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return super.get<T>(key);
  }

  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.set('theme', theme);
  }

  getTheme(): 'light' | 'dark' | 'system' {
    return this.get<'light' | 'dark' | 'system'>('theme') ?? 'system';
  }

  setVoiceEnabled(enabled: boolean): void {
    this.set('voiceEnabled', enabled);
  }

  isVoiceEnabled(): boolean {
    return this.get<boolean>('voiceEnabled') ?? false;
  }

  setDefaultModel(model: string): void {
    this.set('defaultModel', model);
  }

  getDefaultModel(): string | undefined {
    return this.get<string>('defaultModel');
  }

  setAutoApprove(enabled: boolean): void {
    this.set('autoApprove', enabled);
  }

  isAutoApprove(): boolean {
    return this.get<boolean>('autoApprove') ?? false;
  }
}

export class DecisionsMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'decisions');
  }

  recordDecision(
    title: string,
    description: string,
    rationale: string,
    alternatives?: string[]
  ): void {
    const id = `decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.set(id, {
      title,
      description,
      rationale,
      alternatives: alternatives ?? [],
      status: 'active',
      recordedAt: Date.now(),
    });
  }

  getDecisions(): Array<{ key: string; value: unknown }> {
    return this.list().map((e) => ({ key: e.key, value: e.value }));
  }

  getActiveDecisions(): Array<{ key: string; value: Record<string, unknown> }> {
    return this.list()
      .map((e) => ({ key: e.key, value: e.value as Record<string, unknown> }))
      .filter((d) => d.value.status === 'active');
  }

  deprecateDecision(key: string): void {
    const decision = this.get<Record<string, unknown>>(key);
    if (decision) {
      decision.status = 'deprecated';
      decision.deprecatedAt = Date.now();
      this.set(key, decision);
    }
  }

  addContext(decisionKey: string, context: string): void {
    const decision = this.get<Record<string, unknown>>(decisionKey);
    if (decision) {
      const contexts = (decision.contexts as string[]) ?? [];
      contexts.push(context);
      decision.contexts = contexts;
      this.set(decisionKey, decision);
    }
  }
}

export class ErrorsMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'errors');
  }

  recordError(
    pattern: string,
    solution: string,
    context?: Record<string, unknown>
  ): void {
    const id = `error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.set(id, {
      pattern,
      solution,
      context: context ?? {},
      occurrences: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    });
  }

  findSimilar(pattern: string): Array<{ key: string; value: Record<string, unknown> }> {
    const lowerPattern = pattern.toLowerCase();
    return this.list()
      .map((e) => ({ key: e.key, value: e.value as Record<string, unknown> }))
      .filter(
        (e) =>
          typeof e.value.pattern === 'string' &&
          e.value.pattern.toLowerCase().includes(lowerPattern)
      );
  }

  incrementOccurrence(key: string): void {
    const entry = this.get<Record<string, unknown>>(key);
    if (entry) {
      entry.occurrences = ((entry.occurrences as number) ?? 0) + 1;
      entry.lastSeen = Date.now();
      this.set(key, entry);
    }
  }

  getMostCommon(limit: number = 10): Array<{ key: string; value: Record<string, unknown> }> {
    return this.list()
      .map((e) => ({ key: e.key, value: e.value as Record<string, unknown> }))
      .sort((a, b) => ((b.value.occurrences as number) ?? 0) - ((a.value.occurrences as number) ?? 0))
      .slice(0, limit);
  }
}

export class LongTermMemory extends BaseLayerManager {
  constructor(store: MemoryStore) {
    super(store, 'long-term');
  }

  storeFact(category: string, key: string, value: unknown): void {
    const fullKey = `fact:${category}:${key}`;
    this.set(fullKey, {
      category,
      key,
      value,
      storedAt: Date.now(),
    });
  }

  getFact(category: string, key: string): unknown {
    const fullKey = `fact:${category}:${key}`;
    const entry = this.get<Record<string, unknown>>(fullKey);
    return entry?.value;
  }

  listFacts(category?: string): Array<{ key: string; value: unknown }> {
    const entries = this.list();
    return entries
      .filter((e) => {
        if (!category) return e.key.startsWith('fact:');
        return e.key.startsWith(`fact:${category}:`);
      })
      .map((e) => {
        const factValue = e.value as Record<string, unknown>;
        return { key: factValue.key as string, value: factValue.value };
      });
  }

  deleteFact(category: string, key: string): boolean {
    const fullKey = `fact:${category}:${key}`;
    return this.delete(fullKey);
  }

  storeNote(noteKey: string, content: string, tags?: string[]): void {
    this.set(`note:${noteKey}`, {
      content,
      tags: tags ?? [],
      createdAt: Date.now(),
    });
  }

  getNote(noteKey: string): { content: string; tags: string[] } | undefined {
    return this.get(`note:${noteKey}`);
  }

  listNotes(tag?: string): Array<{ key: string; content: string; tags: string[] }> {
    const entries = this.list().filter((e) => e.key.startsWith('note:'));
    const notes = entries.map((e) => {
      const noteValue = e.value as Record<string, unknown>;
      return {
        key: (noteValue.key as string) ?? e.key.replace('note:', ''),
        content: noteValue.content as string,
        tags: (noteValue.tags as string[]) ?? [],
      };
    });

    if (tag) {
      return notes.filter((n) => n.tags.includes(tag));
    }
    return notes;
  }
}