import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import type { MemoryManager } from '@phoenix/memory';
import type { MemoryLayer } from '@phoenix/memory';

const VALID_LAYERS: MemoryLayer[] = [
  'session', 'project', 'preferences', 'decisions', 'errors', 'long-term',
];

export function createMemoryRoutes(memoryManager: MemoryManager): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/:projectId', (req: Request, res: Response): void => {
    const { projectId } = req.params;
    const { layer } = req.query as { layer?: string };

    if (layer && !VALID_LAYERS.includes(layer as MemoryLayer)) {
      res.status(400).json({
        error: `Invalid layer. Must be one of: ${VALID_LAYERS.join(', ')}`,
      });
      return;
    }

    try {
      if (layer) {
        const manager = memoryManager.getLayer(layer as MemoryLayer);
        const entries = manager.list();
        res.json({ projectId, layer, entries });
      } else {
        const allEntries: Record<string, any[]> = {};
        for (const l of VALID_LAYERS) {
          const manager = memoryManager.getLayer(l);
          allEntries[l] = manager.list();
        }
        res.json({ projectId, entries: allEntries });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/:projectId', (req: Request, res: Response): void => {
    const { projectId } = req.params;
    const { layer, key, value, metadata } = req.body as {
      layer?: string;
      key?: string;
      value?: unknown;
      metadata?: Record<string, unknown>;
    };

    if (!layer || !key || value === undefined) {
      res.status(400).json({ error: 'layer, key, and value are required' });
      return;
    }

    if (!VALID_LAYERS.includes(layer as MemoryLayer)) {
      res.status(400).json({
        error: `Invalid layer. Must be one of: ${VALID_LAYERS.join(', ')}`,
      });
      return;
    }

    try {
      const manager = memoryManager.getLayer(layer as MemoryLayer);
      manager.set(key, value, { ...metadata, projectId });
      const entry = { id: `${layer}:${key}`, layer, key, value, metadata, createdAt: new Date(), updatedAt: new Date() };
      res.status(201).json({ entry });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.put('/:projectId/:id', (req: Request, res: Response): void => {
    const { id } = req.params;
    const { value, metadata, layer: layerFromBody } = req.body as {
      value?: unknown;
      metadata?: Record<string, unknown>;
      layer?: string;
    };

    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    let layer: string;
    let key: string;

    if (id && id.includes(':')) {
      const parts = id.split(':');
      layer = parts[0] ?? '';
      key = parts.slice(1).join(':');
    } else if (layerFromBody) {
      layer = layerFromBody;
      key = id ?? '';
    } else {
      res.status(400).json({ error: 'Entry id must be in format "layer:key" or provide layer in body' });
      return;
    }

    if (!VALID_LAYERS.includes(layer as MemoryLayer)) {
      res.status(400).json({
        error: `Invalid layer. Must be one of: ${VALID_LAYERS.join(', ')}`,
      });
      return;
    }

    try {
      const manager = memoryManager.getLayer(layer as MemoryLayer);
      const existing = manager.get(key);
      if (existing === undefined) {
        res.status(404).json({ error: 'Memory entry not found' });
        return;
      }
      manager.set(key, value, metadata);
      res.json({ success: true, key, layer });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.delete('/:projectId/:id', (req: Request, res: Response): void => {
    const { id } = req.params;
    const { layer: layerFromBody } = req.query as { layer?: string };

    let layer: string;
    let key: string;

    if (id && id.includes(':')) {
      const parts = id.split(':');
      layer = parts[0] ?? '';
      key = parts.slice(1).join(':');
    } else if (layerFromBody) {
      layer = layerFromBody;
      key = id ?? '';
    } else {
      res.status(400).json({ error: 'Entry id must be in format "layer:key" or provide layer query param' });
      return;
    }

    if (!VALID_LAYERS.includes(layer as MemoryLayer)) {
      res.status(400).json({
        error: `Invalid layer. Must be one of: ${VALID_LAYERS.join(', ')}`,
      });
      return;
    }

    try {
      const manager = memoryManager.getLayer(layer as MemoryLayer);
      const deleted = manager.delete(key);
      if (!deleted) {
        res.status(404).json({ error: 'Memory entry not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/:projectId/search', (req: Request, res: Response): void => {
    const { q } = req.query as { q?: string };

    if (!q) {
      res.status(400).json({ error: 'q (query) parameter is required' });
      return;
    }

    try {
      const results = memoryManager.search(q);
      res.json({ query: q, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
