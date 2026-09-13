import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import { ConsoleSTT } from '@phoenix/voice';
import { ConsoleTTS } from '@phoenix/voice';
import { VoiceManager } from '@phoenix/voice';

const voiceManager = new VoiceManager();

const sttProvider = new ConsoleSTT();
const ttsProvider = new ConsoleTTS();
voiceManager.initialize(sttProvider);

export function createVoiceRoutes(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.post('/stt', async (req: Request, res: Response): Promise<void> => {
    const { audioData } = req.body as { audioData?: string };

    try {
      let buffer: ArrayBuffer | undefined;
      if (audioData) {
        const decoded = Buffer.from(audioData, 'base64');
        buffer = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
      }
      const result = await sttProvider.stt(buffer);
      res.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post('/tts', async (req: Request, res: Response): Promise<void> => {
    const { text, voice, speed, pitch } = req.body as {
      text?: string;
      voice?: string;
      speed?: number;
      pitch?: number;
    };

    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    try {
      await ttsProvider.tts(text, { voice, speed, pitch });
      res.json({ success: true, message: 'TTS completed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
