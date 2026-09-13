import { useState, useCallback } from 'react';
import {
  fetchMemoryLayers,
  fetchMemoryEntries,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
  searchMemory,
  type MemoryLayer,
  type MemoryEntry,
} from '../lib/api';

interface UseMemoryState {
  layers: MemoryLayer[];
  entries: MemoryEntry[];
  isLoading: boolean;
  error: string | null;
}

export function useMemory() {
  const [state, setState] = useState<UseMemoryState>({
    layers: [],
    entries: [],
    isLoading: false,
    error: null,
  });

  const loadLayers = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetchMemoryLayers();
      if (res.ok && res.data) {
        setState((prev) => ({ ...prev, layers: res.data!, isLoading: false }));
      } else {
        setState((prev) => ({
          ...prev,
          error: res.error || 'Failed to load layers',
          isLoading: false,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: 'Failed to connect to server',
        isLoading: false,
      }));
    }
  }, []);

  const loadEntries = useCallback(async (layer: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await fetchMemoryEntries(layer);
      if (res.ok && res.data) {
        setState((prev) => ({ ...prev, entries: res.data!, isLoading: false }));
      } else {
        setState((prev) => ({
          ...prev,
          error: res.error || 'Failed to load entries',
          isLoading: false,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: 'Failed to connect to server',
        isLoading: false,
      }));
    }
  }, []);

  const addEntry = useCallback(
    async (layer: string, key: string, value: string) => {
      try {
        const res = await createMemoryEntry(layer, key, value);
        if (res.ok && res.data) {
          setState((prev) => ({
            ...prev,
            entries: [...prev.entries, res.data!],
          }));
          return res.data;
        }
        throw new Error(res.error || 'Failed to create entry');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create entry';
        setState((prev) => ({ ...prev, error: msg }));
        throw err;
      }
    },
    [],
  );

  const editEntry = useCallback(
    async (layer: string, id: string, value: string) => {
      try {
        const res = await updateMemoryEntry(layer, id, value);
        if (res.ok && res.data) {
          setState((prev) => ({
            ...prev,
            entries: prev.entries.map((e) => (e.id === id ? res.data! : e)),
          }));
          return res.data;
        }
        throw new Error(res.error || 'Failed to update entry');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update entry';
        setState((prev) => ({ ...prev, error: msg }));
        throw err;
      }
    },
    [],
  );

  const removeEntry = useCallback(async (layer: string, id: string) => {
    try {
      const res = await deleteMemoryEntry(layer, id);
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          entries: prev.entries.filter((e) => e.id !== id),
        }));
        return;
      }
      throw new Error(res.error || 'Failed to delete entry');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete entry';
      setState((prev) => ({ ...prev, error: msg }));
      throw err;
    }
  }, []);

  const search = useCallback(async (query: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await searchMemory(query);
      if (res.ok && res.data) {
        setState((prev) => ({ ...prev, entries: res.data!, isLoading: false }));
      } else {
        setState((prev) => ({
          ...prev,
          error: res.error || 'Search failed',
          isLoading: false,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: 'Search failed',
        isLoading: false,
      }));
    }
  }, []);

  return {
    ...state,
    loadLayers,
    loadEntries,
    addEntry,
    editEntry,
    removeEntry,
    search,
  };
}
