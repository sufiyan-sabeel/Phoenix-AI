import type { PhoenixConfig } from './config.js';
import { printToken, printToolCall, printToolResult, printError, printSuccess, printWarning } from './output.js';

export interface RemoteMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface RemoteSession {
  id: string;
  messages: RemoteMessage[];
  mode: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'paused' | 'completed';
}

export interface RemoteConnection {
  url: string;
  authToken?: string;
  ws?: WebSocket;
  connected: boolean;
}

export interface StreamChunk {
  type: 'token' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    toolCallId: string;
    content: unknown;
    error?: string;
  };
  error?: string;
}

export class RemoteClient {
  private config: PhoenixConfig;
  private connection: RemoteConnection;
  private abortController: AbortController | null = null;
  private eventListeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(config: PhoenixConfig) {
    this.config = config;
    this.connection = {
      url: config.server.url,
      authToken: config.server.authToken,
      connected: false,
    };
  }

  async connect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.connection.url}/api/health`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        this.connection.connected = true;
        printSuccess(`Connected to ${this.connection.url}`);
        return true;
      }
      
      printWarning(`Server responded with status ${response.status}`);
      return false;
    } catch (error) {
      printError(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection.ws) {
      this.connection.ws.close();
      this.connection.ws = undefined;
    }
    this.connection.connected = false;
  }

  isConnected(): boolean {
    return this.connection.connected;
  }

  async createSession(mode: string): Promise<RemoteSession> {
    const response = await this.request('POST', '/api/sessions', { mode });
    return response as RemoteSession;
  }

  async getSession(sessionId: string): Promise<RemoteSession> {
    const response = await this.request('GET', `/api/sessions/${sessionId}`);
    return response as RemoteSession;
  }

  async listSessions(): Promise<RemoteSession[]> {
    const response = await this.request('GET', '/api/sessions');
    return (response as { sessions: RemoteSession[] }).sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/api/sessions/${sessionId}`);
  }

  async resumeSession(sessionId: string): Promise<RemoteSession> {
    const response = await this.request('POST', `/api/sessions/${sessionId}/resume`);
    return response as RemoteSession;
  }

  async *sendMessage(
    message: string,
    sessionId: string
  ): AsyncGenerator<StreamChunk> {
    this.abortController = new AbortController();
    
    try {
      const response = await fetch(`${this.connection.url}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: message }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6)) as StreamChunk;
              yield chunk;
              
              if (chunk.type === 'done') return;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async getProviders(): Promise<string[]> {
    const response = await this.request('GET', '/api/providers');
    return (response as { providers: string[] }).providers;
  }

  async getModels(provider: string): Promise<string[]> {
    const response = await this.request('GET', `/api/providers/${provider}/models`);
    return (response as { models: string[] }).models;
  }

  async getStatus(): Promise<{
    version: string;
    uptime: number;
    activeSessions: number;
    providers: string[];
  }> {
    const response = await this.request('GET', '/api/status');
    return response as {
      version: string;
      uptime: number;
      activeSessions: number;
      providers: string[];
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.connection.url}${path}`, {
      method,
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'PhoenixCLI/0.1.0',
    };
    
    if (this.connection.authToken) {
      headers['Authorization'] = `Bearer ${this.connection.authToken}`;
    }
    
    return headers;
  }

  on(event: string, listener: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: string, listener: (data: unknown) => void): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: string, data: unknown): void {
    this.eventListeners.get(event)?.forEach(listener => listener(data));
  }
}

export async function connectToRemote(config: PhoenixConfig): Promise<RemoteClient> {
  const client = new RemoteClient(config);
  await client.connect();
  return client;
}

export async function streamRemoteMessage(
  client: RemoteClient,
  message: string,
  sessionId: string,
  options?: {
    onToken?: (token: string) => void;
    onToolCall?: (toolCall: StreamChunk['toolCall']) => void;
    onToolResult?: (toolResult: StreamChunk['toolResult']) => void;
    onError?: (error: string) => void;
    onDone?: () => void;
  }
): Promise<void> {
  for await (const chunk of client.sendMessage(message, sessionId)) {
    switch (chunk.type) {
      case 'token':
        if (chunk.content && options?.onToken) {
          options.onToken(chunk.content);
        }
        break;
      case 'tool_call':
        if (chunk.toolCall && options?.onToolCall) {
          options.onToolCall(chunk.toolCall);
        }
        break;
      case 'tool_result':
        if (chunk.toolResult && options?.onToolResult) {
          options.onToolResult(chunk.toolResult);
        }
        break;
      case 'error':
        if (chunk.error && options?.onError) {
          options.onError(chunk.error);
        }
        break;
      case 'done':
        if (options?.onDone) {
          options.onDone();
        }
        return;
    }
  }
}
