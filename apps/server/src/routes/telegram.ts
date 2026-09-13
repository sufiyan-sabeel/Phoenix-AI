import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import type { BotManager } from '@phoenix/telegram';
import type { TelegramConfig } from '@phoenix/telegram';

export function createTelegramRoutes(botManager: BotManager): Router {
  const router = Router();

  router.use(authMiddleware);

  router.post('/configure', async (req: Request, res: Response): Promise<void> => {
    const { botToken, allowedUsers, webhookUrl } = req.body as {
      botToken?: string;
      allowedUsers?: number[];
      webhookUrl?: string;
    };

    if (!botToken) {
      res.status(400).json({ error: 'botToken is required' });
      return;
    }

    try {
      if (botManager.isRunning()) {
        botManager.stop();
      }

      const config: TelegramConfig = {
        botToken,
        allowedUsers: allowedUsers ?? [],
        webhookUrl,
      };

      await botManager.start(config);
      res.json({
        success: true,
        status: botManager.getStatus(),
        message: 'Telegram bot connected successfully',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/status', (_req: Request, res: Response): void => {
    res.json({
      status: botManager.getStatus(),
      running: botManager.isRunning(),
    });
  });

  router.post('/test', async (req: Request, res: Response): Promise<void> => {
    const { chatId, message } = req.body as { chatId?: number; message?: string };

    if (!chatId || !message) {
      res.status(400).json({ error: 'chatId and message are required' });
      return;
    }

    if (!botManager.isRunning()) {
      res.status(503).json({ error: 'Bot is not running. Configure it first.' });
      return;
    }

    try {
      await botManager.sendMessage(chatId, message);
      res.json({ success: true, message: 'Test message sent' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.delete('/', (_req: Request, res: Response): void => {
    botManager.stop();
    res.json({ success: true, message: 'Telegram bot disconnected' });
  });

  return router;
}
