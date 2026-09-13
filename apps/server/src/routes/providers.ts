import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { listProviders, checkProviderHealth, type ProviderName } from '@phoenix/ai';
import { getApiKeyForProvider } from '../config.js';

export function createProviderRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', (_req: Request, res: Response): void => {
    const providers = listProviders();
    const result = providers.map(p => ({
      name: p.name,
      models: p.models,
      requiresApiKey: p.requiresApiKey,
      configured: p.requiresApiKey ? !!getApiKeyForProvider(p.name.toLowerCase().replace(/\s+/g, '') as ProviderName) : true,
    }));
    res.json({ providers: result });
  });

  router.post('/:provider/health', async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.params;
    const providerKey = (provider ?? '').toLowerCase().replace(/\s+/g, '') as ProviderName;

    const apiKey = getApiKeyForProvider(providerKey);
    if (apiKey === undefined) {
      res.status(400).json({
        error: `No API key configured for provider: ${provider}`,
      });
      return;
    }

    try {
      const healthy = await checkProviderHealth(providerKey, apiKey);
      res.json({
        provider: provider,
        healthy,
        status: healthy ? 'ok' : 'unavailable',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.json({
        provider: provider,
        healthy: false,
        status: 'error',
        error: message,
      });
    }
  });

  return router;
}
