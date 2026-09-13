import type {
  MemoryLayer,
  MemoryEntry,
  MemoryStore,
  MemoryContext,
  MemoryExport,
  LayerManager,
} from './types.js';
import { InMemoryStore } from './store.js';
import {
  BaseLayerManager,
  SessionMemory,
  ProjectMemory,
  PreferencesMemory,
  DecisionsMemory,
  ErrorsMemory,
  LongTermMemory,
} from './layers.js';

export class MemoryManager {
  private store: MemoryStore;
  private layerManagers = new Map<MemoryLayer, LayerManager>();

  constructor(store?: MemoryStore) {
    this.store = store ?? new InMemoryStore();
    this.layerManagers.set('session', new SessionMemory(this.store));
    this.layerManagers.set('project', new ProjectMemory(this.store));
    this.layerManagers.set('preferences', new PreferencesMemory(this.store));
    this.layerManagers.set('decisions', new DecisionsMemory(this.store));
    this.layerManagers.set('errors', new ErrorsMemory(this.store));
    this.layerManagers.set('long-term', new LongTermMemory(this.store));
  }

  getLayer(layer: 'session'): SessionMemory;
  getLayer(layer: 'project'): ProjectMemory;
  getLayer(layer: 'preferences'): PreferencesMemory;
  getLayer(layer: 'decisions'): DecisionsMemory;
  getLayer(layer: 'errors'): ErrorsMemory;
  getLayer(layer: 'long-term'): LongTermMemory;
  getLayer(layer: MemoryLayer): LayerManager;
  getLayer(layer: MemoryLayer): LayerManager {
    const manager = this.layerManagers.get(layer);
    if (!manager) throw new Error(`Unknown memory layer: ${layer}`);
    return manager;
  }

  getMemoryContext(sessionId: string, projectId: string): MemoryContext {
    const session = this.getLayer('session');
    const project = this.getLayer('project');
    const preferences = this.getLayer('preferences');
    const decisions = this.getLayer('decisions');
    const errors = this.getLayer('errors');
    const longTerm = this.getLayer('long-term');

    return {
      sessionId,
      projectId,
      session: session.getState(),
      project: this.layerToRecord(project),
      preferences: this.layerToRecord(preferences),
      decisions: this.layerToRecord(decisions),
      errors: this.layerToRecord(errors),
      longTerm: this.layerToRecord(longTerm),
    };
  }

  exportMemory(projectId: string): MemoryExport {
    const layers: Record<MemoryLayer, MemoryEntry[]> = {
      session: [],
      project: [],
      preferences: [],
      decisions: [],
      errors: [],
      'long-term': [],
    };

    for (const layer of Object.keys(layers) as MemoryLayer[]) {
      const manager = this.layerManagers.get(layer);
      if (manager) {
        layers[layer] = manager.list();
      }
    }

    return {
      projectId,
      exportedAt: new Date(),
      layers,
    };
  }

  importMemory(projectId: string, data: MemoryExport): void {
    for (const layer of Object.keys(data.layers) as MemoryLayer[]) {
      const manager = this.layerManagers.get(layer);
      if (manager) {
        for (const entry of data.layers[layer]) {
          this.store.set(layer, entry.key, entry.value, entry.metadata);
        }
      }
    }
  }

  search(query: string, layers?: MemoryLayer[]): MemoryEntry[] {
    return this.store.search(query, layers);
  }

  clearLayer(layer: MemoryLayer): void {
    this.store.clear(layer);
  }

  clearAll(): void {
    this.store.clear();
  }

  getSize(): Record<MemoryLayer, number> {
    const sizes = {} as Record<MemoryLayer, number>;
    for (const layer of ['session', 'project', 'preferences', 'decisions', 'errors', 'long-term'] as MemoryLayer[]) {
      sizes[layer] = this.store.size(layer);
    }
    return sizes;
  }

  private layerToRecord(manager: LayerManager): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const entry of manager.list()) {
      record[entry.key] = entry.value;
    }
    return record;
  }
}