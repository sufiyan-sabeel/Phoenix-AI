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

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; tool_use?: unknown; tool_result?: unknown }>;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
  temperature?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
    partial_json?: string;
  };
  index?: number;
  content_block?: {
    type: string;
    id?: string;
    name?: string;
  };
  message?: {
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface AnthropicConfig extends ProviderConfig {
  baseURL?: string;
}

export class AnthropicProvider extends BaseProvider {
  private baseURL: string;

  static readonly MODELS = [
    'claude-sonnet-4-20250514',
    'claude-3-5-haiku-20241022',
  ] as const;

  constructor(config: AnthropicConfig) {
    super({
      ...config,
      defaultModel: config.defaultModel ?? 'claude-sonnet-4-20250514',
      baseURL: config.baseURL ?? 'https://api.anthropic.com/v1',
    });
    this.baseURL = this.config.baseURL;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const { system, messages } = this.buildMessages(options.messages);
      const body: AnthropicRequest = {
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        messages,
        temperature: options.temperature,
        stream: false,
      };
      if (system) body.system = system;
      if (options.tools?.length) {
        body.tools = this.buildTools(options.tools);
      }
      const response = await this.fetchWithTimeout(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: this.buildHeaders({
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw { statusCode: response.status, message: errorBody };
      }
      const data = (await response.json()) as AnthropicResponse;
      return this.parseResponse(data);
    }, 'anthropic.chat');
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const { system, messages } = this.buildMessages(options.messages);
    const body: AnthropicRequest = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      temperature: options.temperature,
      stream: true,
    };
    if (system) body.system = system;
    if (options.tools?.length) {
      body.tools = this.buildTools(options.tools);
    }
    const response = await this.fetchWithTimeout(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: this.buildHeaders({
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      }),
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
    let currentToolId = '';
    let currentToolName = '';
    let toolInput = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as AnthropicStreamEvent;
            const chunk = this.parseStreamEvent(event, currentToolId, currentToolName, toolInput);
            if (chunk) {
              if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                currentToolId = event.content_block.id ?? '';
                currentToolName = event.content_block.name ?? '';
                toolInput = '';
              }
              if (event.type === 'content_block_delta' && event.delta?.partial_json) {
                toolInput += event.delta.partial_json;
              }
              if (event.type === 'content_block_stop' && currentToolId) {
                currentToolId = '';
                currentToolName = '';
                toolInput = '';
              }
              yield chunk;
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildMessages(messages: ChatMessage[]): {
    system: string | undefined;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const result: AnthropicMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
        continue;
      }
      if (msg.role === 'tool') {
        const lastUserMsg = result[result.length - 1];
        if (lastUserMsg && lastUserMsg.role === 'user' && Array.isArray(lastUserMsg.content)) {
          lastUserMsg.content.push({
            type: 'tool_result',
            tool_use_id: msg.toolCallId ?? '',
            content: msg.content,
          });
        }
        continue;
      }
      const content: AnthropicMessage['content'] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
      }
      result.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: content.length === 1 && content[0].type === 'text'
          ? (content[0].text ?? '')
          : content,
      });
    }
    return { system, messages: result };
  }

  private buildTools(tools: ToolDefinition[]): AnthropicTool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  private parseResponse(data: AnthropicResponse): ChatResponse {
    const text = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
    const toolCalls = data.content
      .filter(c => c.type === 'tool_use')
      .map(c => ({
        id: c.id ?? '',
        name: c.name ?? '',
        arguments: JSON.stringify(c.input ?? {}),
      }));
    return {
      content: text,
      toolCalls,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
    };
  }

  private parseStreamEvent(
    event: AnthropicStreamEvent,
    _currentToolId: string,
    _currentToolName: string,
    _toolInput: string
  ): StreamChunk | null {
    switch (event.type) {
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          return { delta: event.delta.text ?? '' };
        }
        if (event.delta?.type === 'input_json_delta') {
          return { delta: '', toolCall: { arguments: event.delta.partial_json ?? '' } };
        }
        return null;
      case 'message_delta':
        return { delta: '', finishReason: event.delta?.stop_reason ?? undefined };
      default:
        return null;
    }
  }
}
