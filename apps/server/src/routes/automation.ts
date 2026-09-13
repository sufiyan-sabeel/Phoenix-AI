import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import type { WorkflowEngine } from '@phoenix/automation';
import type { Trigger, WorkflowStep } from '@phoenix/automation';
import { WebhookHandler } from '@phoenix/automation';

export function createAutomationRoutes(workflowEngine: WorkflowEngine): Router {
  const router = Router();
  const webhookHandler = new WebhookHandler();

  router.use(authMiddleware);

  router.get('/workflows', (_req: Request, res: Response): void => {
    const workflows = workflowEngine.listWorkflows();
    res.json({ workflows });
  });

  router.post('/workflows', (req: Request, res: Response): void => {
    const { name, description, trigger, steps } = req.body as {
      name?: string;
      description?: string;
      trigger?: Trigger;
      steps?: WorkflowStep[];
    };

    if (!name || !trigger || !steps) {
      res.status(400).json({ error: 'name, trigger, and steps are required' });
      return;
    }

    try {
      const workflow = workflowEngine.createWorkflow(name, trigger, steps, description);
      res.status(201).json({ workflow });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.put('/workflows/:id', (req: Request, res: Response): void => {
    const { id } = req.params;
    const { name, description, trigger, steps, enabled } = req.body as {
      name?: string;
      description?: string;
      trigger?: Trigger;
      steps?: WorkflowStep[];
      enabled?: boolean;
    };

    const workflow = workflowEngine.updateWorkflow(id ?? '', {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(trigger !== undefined && { trigger }),
      ...(steps !== undefined && { steps }),
      ...(enabled !== undefined && { enabled }),
    });

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    res.json({ workflow });
  });

  router.delete('/workflows/:id', (req: Request, res: Response): void => {
    const { id } = req.params;
    const deleted = workflowEngine.deleteWorkflow(id ?? '');

    if (!deleted) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    res.json({ success: true });
  });

  router.post('/workflows/:id/execute', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { triggerData } = req.body as { triggerData?: Record<string, unknown> };

    try {
      const result = await workflowEngine.executeWorkflow(id ?? '', triggerData ?? {});
      res.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/webhooks/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const workflow = workflowEngine.getWorkflow(id ?? '');

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    if (workflow.trigger.type !== 'webhook') {
      res.status(400).json({ error: 'Workflow trigger is not a webhook' });
      return;
    }

    try {
      const result = await workflowEngine.executeWorkflow(id ?? '', {
        webhook: {
          method: req.method,
          path: req.path,
          body: req.body,
          headers: req.headers,
        },
      });
      res.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
