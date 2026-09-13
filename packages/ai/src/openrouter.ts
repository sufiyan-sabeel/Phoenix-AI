import { OpenAIProvider } from './openai.js';
import type { OpenAIConfig } from './openai.js';

export interface OpenRouterConfig extends OpenAIConfig {
  siteName?: string;
  siteUrl?: string;
}

export class OpenRouterProvider extends OpenAIProvider {
  private siteName: string;
  private siteUrl: string;

  static readonly MODELS = [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-3-5-haiku-20241022',
    'google/gemini-2.5-pro',
    'google/gemini-2.0-flash',
    'deepseek/deepseek-chat',
    'meta-llama/llama-3.1-405b-instruct',
  ] as const;

  constructor(config: OpenRouterConfig) {
    super({
      ...config,
      baseURL: config.baseURL ?? 'https://openrouter.ai/api/v1',
      defaultModel: config.defaultModel ?? 'openai/gpt-4o',
    });
    this.siteName = config.siteName ?? 'Phoenix AI';
    this.siteUrl = config.siteUrl ?? 'https://phoenix.ai';
  }

  protected override buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      ...super.buildHeaders(extra),
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
    };
  }
}
