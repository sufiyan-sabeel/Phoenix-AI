export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  abortSignal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: UsageInfo;
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamChunk {
  delta: string;
  finishReason?: string;
  toolCall?: Partial<ToolCall>;
}

export interface ChatModel {
  chat(options: ChatOptions): Promise<ChatResponse>;
  chatStream(options: ChatOptions): AsyncGenerator<StreamChunk>;
}

export interface CompletionModel {
  complete(prompt: string, options?: Partial<ChatOptions>): Promise<string>;
}

export interface ProviderError extends Error {
  provider: string;
  statusCode?: number;
  retryable: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface UsageTracker {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  requestCount: number;
}
