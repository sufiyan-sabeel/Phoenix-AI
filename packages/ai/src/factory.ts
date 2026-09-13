import type { ChatModel, ProviderConfig } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OpenRouterProvider } from './openrouter.js';
import { OllamaProvider } from './ollama.js';

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama';

export interface ProviderOptions extends Partial<ProviderConfig> {
  baseURL?: string;
  defaultModel?: string;
  siteName?: string;
  siteUrl?: string;
}

interface ProviderInfo {
  name: string;
  models: readonly string[];
  requiresApiKey: boolean;
}

const PROVIDER_REGISTRY: Record<ProviderName, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    models: OpenAIProvider.MODELS,
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    models: AnthropicProvider.MODELS,
    requiresApiKey: true,
  },
  gemini: {
    name: 'Google Gemini',
    models: GeminiProvider.MODELS,
    requiresApiKey: true,
  },
  openrouter: {
    name: 'OpenRouter',
    models: OpenRouterProvider.MODELS,
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama',
    models: OllamaProvider.MODELS,
    requiresApiKey: false,
  },
};

export function createProvider(
  provider: ProviderName,
  apiKey: string,
  options?: ProviderOptions
): ChatModel {
  const info = PROVIDER_REGISTRY[provider];
  if (!info) {
    throw new Error(
      `Unknown provider: ${provider}. Supported: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`
    );
  }
  if (info.requiresApiKey && !apiKey) {
    throw new Error(`API key is required for ${info.name} provider`);
  }
  const config: ProviderConfig = {
    apiKey,
    baseURL: options?.baseURL,
    defaultModel: options?.defaultModel,
    maxRetries: options?.maxRetries,
    timeout: options?.timeout,
  };
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'openrouter':
      return new OpenRouterProvider({
        ...config,
        siteName: options?.siteName,
        siteUrl: options?.siteUrl,
      });
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

export function listProviders(): ProviderInfo[] {
  return Object.values(PROVIDER_REGISTRY);
}

export function getProviderInfo(provider: ProviderName): ProviderInfo | undefined {
  return PROVIDER_REGISTRY[provider];
}

export async function checkProviderHealth(provider: ProviderName, apiKey: string, options?: ProviderOptions): Promise<boolean> {
  try {
    const model = createProvider(provider, apiKey, options);
    const testModel = options?.defaultModel ?? PROVIDER_REGISTRY[provider].models[0];
    await model.chat({
      model: testModel,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 5,
    });
    return true;
  } catch {
    return false;
  }
}
