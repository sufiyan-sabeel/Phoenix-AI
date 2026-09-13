import { BaseProvider } from './base.js';
import type {
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolDefinition,
  ChatMessage,
  UsageInfo,
  ProviderConfig,
} from './types.js';

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_call_id?: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaListResponse {
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
  }>;
}

interface OllamaPullRequest {
  name: string;
  stream?: boolean;
}

export interface OllamaConfig extends ProviderConfig {
  baseURL?: string;
}

export class OllamaProvider extends BaseProvider {
  private baseURL: string;

  static readonly MODELS = [
    'llama3.1',
    'llama3.2',
    'mistral',
    'codellama',
    'deepseek-coder-v2',
    'qwen2.5',
  ] as const;

  constructor(config: OllamaConfig) {
    super({
      ...config,
      apiKey: config.apiKey ?? 'ollama',
      defaultModel: config.defaultModel ?? 'llama3.1',
      baseURL: config.baseURL ?? 'http://localhost:11434',
    });
    this.baseURL = this.config.baseURL;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const body: OllamaChatRequest = {
        model: options.model,
        messages: this.buildMessages(options.messages),
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
        },
      };
      if (options.tools?.length) {
        body.tools = this.buildTools(options.tools);
      }
      const response = await this.fetchWithTimeout(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw { statusCode: response.status, message: errorBody };
      }
      const data = (await response.json()) as OllamaChatResponse;
      return this.parseResponse(data);
    }, 'ollama.chat');
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const body: OllamaChatRequest = {
      model: options.model,
      messages: this.buildMessages(options.messages),
      stream: true,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };
    if (options.tools?.length) {
      body.tools = this.buildTools(options.tools);
    }
    const response = await this.fetchWithTimeout(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw { statusCode: response.status, message: errorBody };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as OllamaChatResponse;
            const toolCalls = data.message.tool_calls?.map(tc => ({
              id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: tc.function.name,
              arguments: JSON.stringify(tc.function.arguments),
            }));
            yield {
              delta: data.message.content ?? '',
              finishReason: data.done ? 'stop' : undefined,
              toolCall: toolCalls?.[0],
            };
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    const response = await this.fetchWithTimeout(`${this.baseURL}/api/tags`);
    if (!response.ok) {
      throw new Error('Failed to list Ollama models');
    }
    const data = (await response.json()) as OllamaListResponse;
    return data.models.map(m => m.name);
  }

  async pullModel(modelName: string): Promise<void> {
    const body: OllamaPullRequest = { name: modelName, stream: false };
    const response = await this.fetchWithTimeout(`${this.baseURL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to pull model ${modelName}: ${errorBody}`);
    }
  }

  private buildMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages.map(msg => {
      const ollamaMsg: OllamaMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.toolCalls?.length) {
        ollamaMsg.tool_calls = msg.toolCalls.map(tc => ({
          function: {
            name: tc.name,
            arguments: JSON.parse(tc.arguments),
          },
        }));
      }
      if (msg.toolCallId) {
        ollamaMsg.tool_call_id = msg.toolCallId;
      }
      return ollamaMsg;
    });
  }

  private buildTools(tools: ToolDefinition[]): OllamaTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private parseResponse(data: OllamaChatResponse): ChatResponse {
    const toolCalls = data.message.tool_calls?.map(tc => ({
      id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: tc.function.name,
      arguments: JSON.stringify(tc.function.arguments),
    })) ?? [];
    const usage: UsageInfo = {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
    };
    return {
      content: data.message.content ?? '',
      toolCalls,
      usage,
    };
  }
}
