import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  addServer,
  removeServer,
  listConfigs,
  getConfig,
  connectServer,
  disconnectServer,
  getToolsByServer,
  refreshTools,
  listServers,
  listTools,
} from '@phoenix/mcp';
import { storeCredential } from '@phoenix/mcp';
import type { ConnectorConfig, MCPTransport } from '@phoenix/mcp';

export function createMCPRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/connectors', (_req: Request, res: Response): void => {
    const configs = listConfigs();
    const servers = listServers();
    const serverMap = new Map(servers.map(s => [s.id, s]));

    const connectors = configs.map(config => {
      const server = serverMap.get(config.id);
      return {
        ...config,
        status: server?.status ?? 'disconnected',
        toolCount: server?.tools.length ?? 0,
      };
    });

    res.json({ connectors });
  });

  router.post('/connectors', async (req: Request, res: Response): Promise<void> => {
    const { name, type, endpoint, authType, credentials, scopes, enabled } = req.body as {
      name?: string;
      type?: string;
      endpoint?: string;
      authType?: string;
      credentials?: Record<string, string>;
      scopes?: string[];
      enabled?: boolean;
    };

    if (!name || !type || !endpoint) {
      res.status(400).json({ error: 'name, type, and endpoint are required' });
      return;
    }

    const validTransports: MCPTransport[] = ['sse', 'http', 'stdio'];
    if (!validTransports.includes(type as MCPTransport)) {
      res.status(400).json({
        error: `Invalid type. Must be one of: ${validTransports.join(', ')}`,
      });
      return;
    }

    const id = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const config: ConnectorConfig = {
      id,
      name,
      type: type as MCPTransport,
      endpoint,
      authType: (authType as ConnectorConfig['authType']) ?? 'none',
      credentials: credentials ?? {},
      scopes: scopes ?? [],
      enabled: enabled ?? true,
    };

    try {
      addServer(config);

      if (credentials && Object.keys(credentials).length > 0) {
        await storeCredential(id, credentials);
      }

      res.status(201).json({ connector: config });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.put('/connectors/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const existing = getConfig(id ?? '');
    if (!existing) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    const { name, endpoint, authType, credentials, scopes, enabled } = req.body as {
      name?: string;
      endpoint?: string;
      authType?: string;
      credentials?: Record<string, string>;
      scopes?: string[];
      enabled?: boolean;
    };

    const updated: ConnectorConfig = {
      ...existing,
      ...(name !== undefined && { name }),
      ...(endpoint !== undefined && { endpoint }),
      ...(authType !== undefined && { authType: authType as ConnectorConfig['authType'] }),
      ...(scopes !== undefined && { scopes }),
      ...(enabled !== undefined && { enabled }),
    };

    removeServer(id ?? '');
    addServer(updated);

    if (credentials) {
      await storeCredential(id ?? '', credentials);
    }

    res.json({ connector: updated });
  });

  router.delete('/connectors/:id', (req: Request, res: Response): void => {
    const { id } = req.params;
    const existing = getConfig(id ?? '');
    if (!existing) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    removeServer(id ?? '');
    res.json({ success: true });
  });

  router.post('/connectors/:id/connect', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const server = await connectServer(id ?? '');
      res.json({
        connector: {
          id: server.id,
          name: server.name,
          status: server.status,
          toolCount: server.tools.length,
          tools: server.tools.map(t => ({ name: t.name, description: t.description })),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/connectors/:id/disconnect', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      await disconnectServer(id ?? '');
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/connectors/:id/tools', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const tools = await refreshTools(id ?? '');
      res.json({ tools });
    } catch (err) {
      const tools = getToolsByServer(id ?? '');
      res.json({ tools });
    }
  });

  router.get('/tools', (_req: Request, res: Response): void => {
    const tools = listTools();
    res.json({ tools });
  });

  return router;
}
