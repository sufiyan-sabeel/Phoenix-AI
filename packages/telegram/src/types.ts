export interface TelegramConfig {
  botToken: string;
  allowedUsers?: number[];
  webhookUrl?: string;
}

export interface TelegramMessage {
  chatId: number;
  text: string;
  messageId?: number;
  replyTo?: number;
}

export interface TelegramSession {
  chatId: number;
  sessionId: string;
  projectId?: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    document?: {
      file_id: string;
      file_name: string;
      mime_type: string;
    };
    photo?: Array<{
      file_id: string;
      width: number;
      height: number;
    }>;
  };
  edited_message?: TelegramUpdate['message'];
}

export interface TelegramBotResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramInlineKeyboard {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramKeyboardRow {
  inline_keyboard: TelegramInlineKeyboard[];
}

export interface TelegramReplyMarkup {
  reply_markup?: {
    inline_keyboard?: TelegramInlineKeyboard[][];
    force_reply?: boolean;
    remove_keyboard?: boolean;
  };
}