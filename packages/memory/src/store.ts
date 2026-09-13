import { randomUUID } from 'node:crypto';
import type {
  MemoryLayer,
  MemoryEntry,
  MemoryStore,
} from './types.js';

interface SessionEntry extends MemoryEntry {
  expiresAt?: Date;
}

const SESSION_TTL_MS = 30 * 60 * 1000;

export class InMemoryStore implements MemoryStore {
  private layers = new Map<MemoryLayer, Map<string, SessionEntry>>();

  constructor() {
    for (const layer of [
      'session',
      'project',
      'preferences',
      'decisions',
      'errors',
      'long-term',
    ] as MemoryLayer[]) {
      this.layers.set(layer, new Map());
    }
  }

  private getLayer(layer: MemoryLayer): Map<string, SessionEntry> {
    const map = this.layers.get(layer);
    if (!map) throw new Error(`Unknown memory layer: ${layer}`);
    return map;
  }

  get(layer: MemoryLayer, key: string): MemoryEntry | undefined {
    const map = this.getLayer(layer);
    const entry = map.get(key);
    if (!entry) return undefined;
    if (layer === 'session' && entry.expiresAt && entry.expiresAt < new Date()) {
      map.delete(key);
      return undefined;
    }
    return { ...entry };
  }

  set(
    layer: MemoryLayer,
    key: string,
    value: unknown,
    metadata?: Record<string, unknown>
  ): MemoryEntry {
    const map = this.getLayer(layer);
    const now = new Date();
    const existing = map.get(key);

    const entry: SessionEntry = {
      id: existing?.id ?? randomUUID(),
      layer,
      key,
      value,
      metadata: { ...existing?.metadata, ...metadata },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (layer === 'session') {
      entry.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    }

    map.set(key, entry);
    return { ...entry };
  }

  delete(layer: MemoryLayer, key: string): boolean {
    const map = this.getLayer(layer);
    return map.delete(key);
  }

  list(layer: MemoryLayer): MemoryEntry[] {
    const map = this.getLayer(layer);
    this.evictExpired(layer, map);
    return Array.from(map.values()).map((e) => ({ ...e }));
  }

  search(query: string, layers?: MemoryLayer[]): MemoryEntry[] {
    const targetLayers = layers ?? (['session', 'project', 'preferences', 'decisions', 'errors', 'long-term'] as MemoryLayer[]);
    const results: MemoryEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const layer of targetLayers) {
      const map = this.getLayer(layer);
      this.evictExpired(layer, map);
      for (const entry of map.values()) {
        if (
          entry.key.toLowerCase().includes(lowerQuery) ||
          this.valueContainsQuery(entry.value, lowerQuery)
        ) {
          results.push({ ...entry });
        }
      }
    }

    return results;
  }

  clear(layer?: MemoryLayer): void {
    if (layer) {
      this.getLayer(layer).clear();
    } else {
      for (const map of this.layers.values()) {
        map.clear();
      }
    }
  }

  has(layer: MemoryLayer, key: string): boolean {
    return this.get(layer, key) !== undefined;
  }

  size(layer?: MemoryLayer): number {
    if (layer) {
      this.evictExpired(layer, this.getLayer(layer));
      return this.getLayer(layer).size;
    }
    let total = 0;
    for (const [l, map] of this.layers) {
      this.evictExpired(l, map);
      total += map.size;
    }
    return total;
  }

  private evictExpired(layer: MemoryLayer, map: Map<string, SessionEntry>): void {
    if (layer !== 'session') return;
    const now = new Date();
    for (const [key, entry] of map) {
      if (entry.expiresAt && entry.expiresAt < now) {
        map.delete(key);
      }
    }
  }

  private valueContainsQuery(value: unknown, query: string): boolean {
    if (typeof value === 'string') return value.toLowerCase().includes(query);
    if (typeof value === 'number') return String(value).includes(query);
    if (typeof value === 'boolean') return String(value).includes(query);
    if (value === null || value === undefined) return false;
    try {
      return JSON.stringify(value).toLowerCase().includes(query);
    } catch {
      return false;
    }
  }
}