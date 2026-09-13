import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { sseHeaders, streamToSSE } from '../middleware.js';
import type { Orchestrator } from '@phoenix/core';
import type { SessionManager } from '@phoenix/core';

export function createSessionRoutes(
  sessionManager: SessionManager,
  orchestrator: Orchestrator
): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', (_req: Request, res: Response): void => {
    const sessions = sessionManager.listAllSessions();
    res.json({ sessions });
  });

  router.post('/', (req: Request, res: Response): void => {
    const { projectId, provider, model } = req.body as {
      projectId?: string;
      provider?: string;
      model?: string;
    };

    if (!projectId || !provider || !model) {
      res.status(400).json({
        error: 'projectId, provider, and model are required',
      });
      return;
    }

    try {
      const session = sessionManager.createSession(
        projectId,
        provider as any,
        model
      );
      res.status(201).json({ session });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/:id', (req: Request, res: Response): void => {
    const session = sessionManager.getSession(req.params['id'] ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session });
  });

  router.put('/:id', (req: Request, res: Response): void => {
    const { mode, provider, model } = req.body as {
      mode?: string;
      provider?: string;
      model?: string;
    };

    try {
      const session = sessionManager.updateSession(req.params['id'] ?? '', {
        mode: mode as any,
        provider: provider as any,
        model,
      });
      res.json({ session });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  router.delete('/:id', (req: Request, res: Response): void => {
    try {
      sessionManager.deleteSession(req.params['id'] ?? '');
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  router.post('/:id/messages', sseHeaders, async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params['id'] ?? '';
    const { content } = req.body as { content?: string };

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    try {
      const generator = orchestrator.processMessage(sessionId, content);
      await streamToSSE(generator, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else if (message.includes('already processing')) {
        res.status(409).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  return router;
}
