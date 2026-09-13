import type { TelegramConfig, TelegramSession } from './types.js';
import { TelegramBot } from './bot.js';

export interface BotManagerEvents {
  ready: () => void;
  message: (chatId: number, text: string, sessionId: string) => void;
  error: (error: Error) => void;
}

export class BotManager {
  private bot: TelegramBot | null = null;
  private sessions = new Map<number, TelegramSession>();
  private status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private config: TelegramConfig | null = null;
  private token: string | null = null;

  async start(config: TelegramConfig): Promise<void> {
    this.config = config;
    this.token = config.botToken;

    this.status = 'connecting';
    this.bot = new TelegramBot(config);

    this.bot.setMessageHandler(async (chatId, text, sessionId) => {
      this.emit('message', chatId, text, sessionId);
      return '';
    });

    try {
      const me = await this.bot.getMe();
      if (!me.ok) {
        throw new Error(me.description ?? 'Failed to get bot info');
      }

      this.status = 'connected';
      this.bot.startPolling();
      this.emit('ready');
    } catch (error) {
      this.status = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  stop(): void {
    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
    }
    this.status = 'disconnected';
    this.token = null;
  }

  getStatus(): string {
    return this.status;
  }

  isRunning(): boolean {
    return this.status === 'connected' && this.bot !== null;
  }

  getSession(chatId: number): TelegramSession | undefined {
    return this.bot?.getSession(chatId) ?? this.sessions.get(chatId);
  }

  setSessionProject(chatId: number, projectId: string): void {
    this.bot?.setSessionProject(chatId, projectId);
    const session = this.sessions.get(chatId);
    if (session) {
      session.projectId = projectId;
    }
  }

  getAllSessions(): TelegramSession[] {
    return Array.from(this.sessions.values());
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot is not running');
    }
    await this.bot.sendMessage(chatId, text);
  }

  async startStreaming(chatId: number): Promise<void> {
    if (!this.bot) {
      throw new Error('Bot is not running');
    }
    this.bot.startStreaming(chatId);
  }

  async appendStreaming(text: string): Promise<void> {
    this.bot?.appendStreaming(text);
  }

  async finishStreaming(): Promise<void> {
    await this.bot?.finishStreaming();
  }

  on<K extends keyof BotManagerEvents>(event: K, listener: BotManagerEvents[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);

    return () => {
      this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
    };
  }

  off<K extends keyof BotManagerEvents>(event: K, listener: BotManagerEvents[K]): void {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
  }

  private emit<K extends keyof BotManagerEvents>(
    event: K,
    ...args: Parameters<BotManagerEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }
}