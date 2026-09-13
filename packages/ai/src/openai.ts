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

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  tools?: OpenAITool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface OpenAIConfig extends ProviderConfig {
  baseURL?: string;
}

export class OpenAIProvider extends BaseProvider {
  protected baseURL: string;

  static readonly MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] as const;

  constructor(config: OpenAIConfig) {
    super({
      ...config,
      defaultModel: config.defaultModel ?? 'gpt-4o',
      baseURL: config.baseURL ?? 'https://api.openai.com/v1',
    });
    this.baseURL = this.config.baseURL;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const body: OpenAIRequest = {
        model: options.model,
        messages: this.buildMessages(options.messages),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: false,
      };
      if (options.tools?.length) {
        body.tools = this.buildTools(options.tools);
      }
      const response = await this.fetchWithTimeout(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw { statusCode: response.status, message: errorBody };
      }
      const data = (await response.json()) as OpenAIResponse;
      return this.parseResponse(data);
    }, 'openai.chat');
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const body: OpenAIRequest = {
      model: options.model,
      messages: this.buildMessages(options.messages),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    };
    if (options.tools?.length) {
      body.tools = this.buildTools(options.tools);
    }
    const response = await this.fetchWithTimeout(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
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
    const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk;
            const parsed = this.parseStreamChunk(chunk, toolCallBuffers);
            if (parsed) yield parsed;
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  protected buildMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map(msg => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
        content: msg.content || null,
      };
      if (msg.toolCalls?.length) {
        openaiMsg.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      if (msg.toolCallId) {
        openaiMsg.tool_call_id = msg.toolCallId;
      }
      return openaiMsg;
    });
  }

  protected buildTools(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  protected parseResponse(data: OpenAIResponse): ChatResponse {
    const choice = data.choices[0];
    return {
      content: choice.message.content ?? '',
      toolCalls: (choice.message.tool_calls ?? []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  protected parseStreamChunk(
    chunk: OpenAIStreamChunk,
    toolCallBuffers: Map<number, { id: string; name: string; arguments: string }>
  ): StreamChunk | null {
    const choice = chunk.choices[0];
    if (!choice) return null;
    const delta = choice.delta;
    let content = delta.content ?? '';
    let toolCall: StreamChunk['toolCall'] | undefined;
    if (delta.tool_calls?.length) {
      for (const tc of delta.tool_calls) {
        if (!toolCallBuffers.has(tc.index)) {
          toolCallBuffers.set(tc.index, { id: '', name: '', arguments: '' });
        }
        const buf = toolCallBuffers.get(tc.index)!;
        if (tc.id) buf.id = tc.id;
        if (tc.function?.name) buf.name += tc.function.name;
        if (tc.function?.arguments) buf.arguments += tc.function.arguments;
        toolCall = {
          id: buf.id,
          name: buf.name,
          arguments: buf.arguments,
        };
      }
    }
    return {
      delta: content,
      finishReason: choice.finish_reason ?? undefined,
      toolCall,
    };
  }
}
