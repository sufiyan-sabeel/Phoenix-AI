import type {
  ChatModel,
  CompletionModel,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ProviderConfig,
  ProviderError,
} from './types.js';

export abstract class BaseProvider implements ChatModel, CompletionModel {
  protected config: Required<ProviderConfig>;
  protected retryCount = 0;

  constructor(config: ProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? '',
      defaultModel: config.defaultModel ?? '',
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 30000,
    };
  }

  abstract chat(options: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(options: ChatOptions): AsyncGenerator<StreamChunk>;

  async complete(prompt: string, options?: Partial<ChatOptions>): Promise<string> {
    const response = await this.chat({
      model: options?.model ?? this.config.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      ...options,
    });
    return response.content;
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.onRequest(operation, attempt);
        const result = await fn();
        this.onResponse(operation, attempt);
        return result;
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable || attempt === this.config.maxRetries) {
          throw this.wrapError(error, operation);
        }
        const delay = this.getBackoffDelay(attempt);
        this.onRetry(operation, attempt, delay, error);
        await this.sleep(delay);
      }
    }
    throw this.wrapError(lastError, operation);
  }

  protected getBackoffDelay(attempt: number): number {
    const baseDelay = 1000;
    const maxDelay = 30000;
    const jitter = Math.random() * 500;
    return Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
  }

  protected isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503;
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }
    return false;
  }

  protected wrapError(error: unknown, operation: string): ProviderError {
    if (error && typeof error === 'object' && 'provider' in error) {
      return error as ProviderError;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    const providerError = new Error(`${operation} failed: ${err.message}`) as ProviderError;
    providerError.name = 'ProviderError';
    providerError.provider = this.constructor.name;
    providerError.retryable = false;
    if (error && typeof error === 'object' && 'statusCode' in error) {
      providerError.statusCode = (error as { statusCode: number }).statusCode;
      providerError.retryable = this.isRetryableError(error);
    }
    return providerError;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected onRequest(operation: string, attempt: number): void {
    if (attempt > 0) {
      console.debug(`[${this.constructor.name}] Retrying ${operation} (attempt ${attempt})`);
    }
  }

  protected onResponse(_operation: string, _attempt: number): void {
    // Hook for subclasses to log/track responses
  }

  protected onRetry(_operation: string, _attempt: number, _delay: number, _error: unknown): void {
    // Hook for subclasses to log retry attempts
  }

  protected buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...extra,
    };
  }

  protected async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
