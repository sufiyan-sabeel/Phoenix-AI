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

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text?: string; functionCall?: { name: string; args: unknown } }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  systemInstruction?: { parts: Array<{ text: string }> };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string; functionCall?: { name: string; args: unknown } }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
  };
}

export interface GeminiConfig extends ProviderConfig {
  baseURL?: string;
}

export class GeminiProvider extends BaseProvider {
  private baseURL: string;

  static readonly MODELS = [
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
  ] as const;

  constructor(config: GeminiConfig) {
    super({
      ...config,
      defaultModel: config.defaultModel ?? 'gemini-2.0-flash',
      baseURL: config.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta',
    });
    this.baseURL = this.config.baseURL;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    return this.withRetry(async () => {
      const { contents, systemInstruction } = this.buildContents(options.messages);
      const body: GeminiRequest = {
        contents,
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        },
      };
      if (options.tools?.length) {
        body.tools = [this.buildTools(options.tools)];
      }
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      const url = `${this.baseURL}/models/${options.model}:generateContent?key=${this.config.apiKey}`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw { statusCode: response.status, message: errorBody };
      }
      const data = (await response.json()) as GeminiResponse;
      return this.parseResponse(data);
    }, 'gemini.chat');
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const { contents, systemInstruction } = this.buildContents(options.messages);
    const body: GeminiRequest & { stream?: boolean } = {
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };
    if (options.tools?.length) {
      body.tools = [this.buildTools(options.tools)];
    }
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    body.stream = true;
    const url = `${this.baseURL}/models/${options.model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
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
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as GeminiResponse;
              const chunk = this.parseStreamChunk(data);
              if (chunk) yield chunk;
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildContents(messages: ChatMessage[]): {
    contents: GeminiContent[];
    systemInstruction?: string;
  } {
    const contents: GeminiContent[] = [];
    let systemInstruction: string | undefined;
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
        continue;
      }
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: GeminiContent['parts'] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: JSON.parse(tc.arguments),
            },
          });
        }
      }
      if (msg.role === 'tool' && msg.toolCallId) {
        parts.push({ text: msg.content });
      }
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }
    return { contents, systemInstruction };
  }

  private buildTools(tools: ToolDefinition[]): GeminiTool {
    return {
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    };
  }

  private parseResponse(data: GeminiResponse): ChatResponse {
    const candidate = data.candidates?.[0];
    const text = candidate?.content.parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('') ?? '';
    const functionCalls = candidate?.content.parts
      .filter(p => p.functionCall)
      .map(p => ({
        id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args),
      })) ?? [];
    const usage: UsageInfo = {
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
    return { content: text, toolCalls: functionCalls, usage };
  }

  private parseStreamChunk(data: GeminiResponse): StreamChunk | null {
    const candidate = data.candidates?.[0];
    if (!candidate) return null;
    const text = candidate.content.parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('') ?? '';
    const functionCall = candidate.content.parts.find(p => p.functionCall);
    return {
      delta: text,
      finishReason: candidate.finishReason,
      toolCall: functionCall
        ? {
            id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: functionCall.functionCall!.name,
            arguments: JSON.stringify(functionCall.functionCall!.args),
          }
        : undefined,
    };
  }
}
