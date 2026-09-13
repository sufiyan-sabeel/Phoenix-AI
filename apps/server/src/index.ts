import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { getConfig } from './config.js';
import { requestLogger, errorHandler, rateLimit } from './middleware.js';
import { EventBus, SessionManager, Orchestrator, PermissionSystem, SubagentManager } from '@phoenix/core';
import { DefaultAgentEngine } from '@phoenix/agent';
import { createProvider } from '@phoenix/ai';
import { MemoryManager } from '@phoenix/memory';
import { WorkflowEngine } from '@phoenix/automation';
import { BotManager } from '@phoenix/telegram';
import { setupWebSocket } from './ws.js';
import createAuthRoutes from './routes/auth.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createMemoryRoutes } from './routes/memory.js';
import { createMCPRoutes } from './routes/mcp.js';
import { createProviderRoutes } from './routes/providers.js';
import { createTelegramRoutes } from './routes/telegram.js';
import { createAutomationRoutes } from './routes/automation.js';
import { createVoiceRoutes } from './routes/voice.js';
import { createFileRoutes } from './routes/files.js';

async function main() {
  const config = getConfig();

  console.log(`[server] Starting Phoenix server on port ${config.port}`);

  const eventBus = new EventBus((error, event) => {
    console.error(`[event-bus] Handler error for '${event.type}':`, error.message);
  });

  const sessionManager = new SessionManager(eventBus);
  const permissionSystem = new PermissionSystem();
  const memoryManager = new MemoryManager();
  const subagentManager = new SubagentManager(eventBus, sessionManager);
  const workflowEngine = new WorkflowEngine();
  const botManager = new BotManager();

  let agentEngine: DefaultAgentEngine | null = null;

  const primaryProvider = config.providers.openai ?? config.providers.gemini ?? config.providers.anthropic ?? config.providers.openrouter;
  const providerName = config.providers.openai
    ? 'openai'
    : config.providers.gemini
      ? 'gemini'
      : config.providers.anthropic
        ? 'anthropic'
        : 'openrouter';

  if (primaryProvider) {
    try {
      const model = createProvider(providerName as any, primaryProvider);
      agentEngine = new DefaultAgentEngine({ model });
      console.log(`[server] Initialized AI provider: ${providerName}`);
    } catch (err) {
      console.warn(`[server] Failed to initialize AI provider ${providerName}:`, err instanceof Error ? err.message : err);
    }
  } else {
    console.warn('[server] No AI provider configured. Chat functionality will be limited.');
  }

  const toolRegistry = {
    getTools: () => [],
    getTool: () => undefined,
    registerTool: () => {},
  };

  const orchestratorDeps = {
    eventBus,
    sessionManager,
    agentEngine: agentEngine ?? {
      async *processMessage() {
        yield { type: 'error' as const, data: { code: 'NO_PROVIDER', message: 'No AI provider configured', recoverable: false } };
      },
      switchMode: () => {},
      getCurrentMode: () => 'planner' as const,
    },
    toolRegistry,
    memoryStore: {
      get: async () => null,
      set: async (type: any, key: string, value: any) => ({ id: `${type}:${key}`, type, key, value, createdAt: new Date(), updatedAt: new Date() }),
      delete: async () => {},
      list: async () => [],
      search: async () => [],
    },
    permissionSystem,
    subagentManager,
  };

  const orchestrator = new Orchestrator(orchestratorDeps);

  const app = express();

  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 120,
  }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });

  app.get('/api/v1/status', (_req, res) => {
    res.json({
      status: 'running',
      version: '0.1.0',
      providers: {
        gemini: !!config.providers.gemini,
        openai: !!config.providers.openai,
        anthropic: !!config.providers.anthropic,
        openrouter: !!config.providers.openrouter,
      },
      telegram: botManager.getStatus(),
      sessions: sessionManager.listAllSessions().length,
    });
  });

  app.use('/api/v1/auth', createAuthRoutes());
  app.use('/api/v1/sessions', createSessionRoutes(sessionManager, orchestrator));
  app.use('/api/v1/memory', createMemoryRoutes(memoryManager));
  app.use('/api/v1/mcp', createMCPRoutes());
  app.use('/api/v1/providers', createProviderRoutes());
  app.use('/api/v1/telegram', createTelegramRoutes(botManager));
  app.use('/api/v1', createAutomationRoutes(workflowEngine));
  app.use('/api/v1/voice', createVoiceRoutes());
  app.use('/api/v1/files', createFileRoutes());

  app.use(errorHandler);

  const server = createServer(app);
  const wss = setupWebSocket(server, orchestrator);

  botManager.on('message', async (chatId, text, sessionId) => {
    console.log(`[telegram] Message from ${chatId}: ${text.substring(0, 100)}`);
    try {
      await botManager.startStreaming(chatId);
      const generator = orchestrator.processMessage(sessionId, text);
      for await (const event of generator) {
        if (event.type === 'token') {
          await botManager.appendStreaming(event.data.token ?? '');
        }
      }
      await botManager.finishStreaming();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await botManager.sendMessage(chatId, `Error: ${message}`);
    }
  });

  let isShuttingDown = false;

  function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[server] Received ${signal}, shutting down gracefully...`);

    if (botManager.isRunning()) {
      botManager.stop();
      console.log('[server] Telegram bot stopped');
    }

    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    wss.close(() => {
      console.log('[server] WebSocket server closed');
    });

    server.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(config.port, () => {
    console.log(`[server] Phoenix server running on http://localhost:${config.port}`);
    console.log(`[server] WebSocket endpoint: ws://localhost:${config.port}/ws`);
    console.log(`[server] API base: http://localhost:${config.port}/api/v1`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
