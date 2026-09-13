import type {
  TelegramConfig,
  TelegramMessage,
  TelegramSession,
  TelegramUpdate,
  TelegramBotResponse,
  TelegramReplyMarkup,
} from './types.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export class TelegramBot {
  private config: TelegramConfig;
  private baseUrl: string;
  private polling = false;
  private offset = 0;
  private sessions = new Map<number, TelegramSession>();
  private messageHandler?: (chatId: number, text: string, sessionId: string) => Promise<string>;
  private streamingMessageId?: number;
  private streamingChatId?: number;
  private streamingBuffer = '';
  private streamingTimer?: ReturnType<typeof setInterval>;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.baseUrl = `${TELEGRAM_API_BASE}${config.botToken}`;
  }

  setMessageHandler(handler: (chatId: number, text: string, sessionId: string) => Promise<string>): void {
    this.messageHandler = handler;
  }

  async getMe(): Promise<TelegramBotResponse<{ id: number; first_name: string; username: string }>> {
    return this.apiCall('getMe');
  }

  async sendMessage(
    chatId: number,
    text: string,
    replyTo?: number,
    replyMarkup?: TelegramReplyMarkup['reply_markup']
  ): Promise<TelegramBotResponse<{ message_id: number }>> {
    return this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      reply_to_message_id: replyTo,
      parse_mode: 'Markdown',
      ...replyMarkup,
    });
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string
  ): Promise<TelegramBotResponse<boolean>> {
    return this.apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    });
  }

  async deleteMessage(
    chatId: number,
    messageId: number
  ): Promise<TelegramBotResponse<boolean>> {
    return this.apiCall('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async sendDocument(
    chatId: number,
    fileId: string,
    caption?: string
  ): Promise<TelegramBotResponse<unknown>> {
    return this.apiCall('sendDocument', {
      chat_id: chatId,
      document: fileId,
      caption,
    });
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const fileResponse = await this.apiCall<{ file_id: string; file_path: string }>('getFile', {
      file_id: fileId,
    });

    if (!fileResponse.ok || !fileResponse.result) {
      throw new Error(`Failed to get file: ${fileResponse.description}`);
    }

    const url = `${TELEGRAM_API_BASE}${this.config.botToken}/file/${fileResponse.result.file_path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  async sendChatAction(
    chatId: number,
    action: 'typing' | 'upload_photo' | 'upload_video' | 'upload_document'
  ): Promise<TelegramBotResponse<boolean>> {
    return this.apiCall('sendChatAction', {
      chat_id: chatId,
      action,
    });
  }

  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.pollLoop();
  }

  stopPolling(): void {
    this.polling = false;
  }

  startStreaming(chatId: number): void {
    this.streamingChatId = chatId;
    this.streamingBuffer = '';
    this.streamingMessageId = undefined;
    this.streamingTimer = setInterval(() => this.flushStreaming(), 1000);
  }

  appendStreaming(text: string): void {
    this.streamingBuffer += text;
  }

  async finishStreaming(): Promise<void> {
    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
      this.streamingTimer = undefined;
    }

    if (this.streamingChatId !== undefined && this.streamingBuffer) {
      if (this.streamingMessageId !== undefined) {
        await this.editMessage(this.streamingChatId, this.streamingMessageId, this.streamingBuffer);
      } else {
        const result = await this.sendMessage(this.streamingChatId, this.streamingBuffer);
        if (result.ok && result.result) {
          this.streamingMessageId = result.result.message_id;
        }
      }
    }

    this.streamingChatId = undefined;
    this.streamingBuffer = '';
    this.streamingMessageId = undefined;
  }

  private async flushStreaming(): Promise<void> {
    if (!this.streamingChatId || !this.streamingBuffer) return;

    const textToDisplay = this.streamingBuffer + ' ▌';

    if (this.streamingMessageId !== undefined) {
      try {
        await this.editMessage(this.streamingChatId, this.streamingMessageId, textToDisplay);
      } catch {
        // Message may not have changed, ignore
      }
    } else {
      try {
        const result = await this.sendMessage(this.streamingChatId, textToDisplay);
        if (result.ok && result.result) {
          this.streamingMessageId = result.result.message_id;
        }
      } catch (error) {
        console.error('Failed to send streaming message:', error);
      }
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.apiCall<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message', 'edited_message'],
        });

        if (updates.ok && updates.result) {
          for (const update of updates.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (error) {
        if (this.polling) {
          console.error('Polling error:', error);
          await this.sleep(5000);
        }
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) return;

    const chatId = message.chat.id;
    const userId = message.from.id;

    if (this.config.allowedUsers && !this.config.allowedUsers.includes(userId)) {
      await this.sendMessage(chatId, 'You are not authorized to use this bot.');
      return;
    }

    const text = message.text;

    if (text.startsWith('/')) {
      await this.handleCommand(chatId, text);
      return;
    }

    const session = this.getOrCreateSession(chatId);
    if (this.messageHandler) {
      await this.sendChatAction(chatId, 'typing');
      try {
        const response = await this.messageHandler(chatId, text, session.sessionId);
        await this.sendMessage(chatId, response, message.message_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.sendMessage(chatId, `Error: ${errorMessage}`, message.message_id);
      }
    }
  }

  private async handleCommand(chatId: number, text: string): Promise<void> {
    const [command, ...args] = text.split(' ');
    const session = this.getOrCreateSession(chatId);

    switch (command) {
      case '/start':
        await this.sendMessage(
          chatId,
          'Welcome to PHOENIX AI Agent! 🦅\n\n' +
            'I am your AI coding assistant. Send me a message and I will help you with your code.\n\n' +
            'Commands:\n' +
            '/new - Start a new session\n' +
            '/mode - Switch between modes\n' +
            '/memory - Show current memory state\n' +
            '/help - Show this message'
        );
        break;

      case '/new':
        this.sessions.delete(chatId);
        const newSession = this.getOrCreateSession(chatId);
        await this.sendMessage(chatId, `New session started: \`${newSession.sessionId}\``);
        break;

      case '/mode': {
        const mode = args[0] ?? 'agent';
        await this.sendMessage(chatId, `Mode set to: ${mode}`);
        break;
      }

      case '/memory':
        await this.sendMessage(
          chatId,
          `Session: \`${session.sessionId}\`\n` +
            `Project: ${session.projectId ?? 'None'}\n` +
            `Active since: ${session.createdAt.toISOString()}`
        );
        break;

      case '/help':
        await this.sendMessage(
          chatId,
          'Available commands:\n' +
            '/start - Initialize bot\n' +
            '/new - New session\n' +
            '/mode <mode> - Switch mode\n' +
            '/memory - Show memory state\n' +
            '/help - This message'
        );
        break;

      default:
        await this.sendMessage(chatId, `Unknown command: ${command}`);
    }
  }

  private getOrCreateSession(chatId: number): TelegramSession {
    let session = this.sessions.get(chatId);
    if (!session) {
      session = {
        chatId,
        sessionId: `tg_${chatId}_${Date.now()}`,
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(chatId, session);
    } else {
      session.lastActivity = new Date();
    }
    return session;
  }

  getSession(chatId: number): TelegramSession | undefined {
    return this.sessions.get(chatId);
  }

  setSessionProject(chatId: number, projectId: string): void {
    const session = this.sessions.get(chatId);
    if (session) {
      session.projectId = projectId;
    }
  }

  private async apiCall<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<TelegramBotResponse<T>> {
    const url = `${this.baseUrl}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params ?? {}),
    });

    if (!response.ok) {
      return {
        ok: false,
        description: `HTTP ${response.status}: ${response.statusText}`,
        error_code: response.status,
      };
    }

    return response.json() as Promise<TelegramBotResponse<T>>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}