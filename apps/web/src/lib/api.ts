export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  model?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  available: boolean;
}

export interface ServerInfo {
  version: string;
  uptime: number;
  status: 'online' | 'offline' | 'degraded';
  models: ModelInfo[];
  latency?: number;
}

export interface MemoryEntry {
  id: string;
  layer: string;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryLayer {
  name: string;
  description: string;
  entryCount: number;
}

export interface TerminalLine {
  id: string;
  content: string;
  type: 'stdout' | 'stderr' | 'system';
  timestamp: number;
}

export interface McpConnector {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'error';
  config: Record<string, unknown>;
  lastSync?: number;
}

function getBaseUrl(): string {
  try {
    return localStorage.getItem('phoenix_server_url') || 'http://localhost:8080';
  } catch {
    return 'http://localhost:8080';
  }
}

function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem('phoenix_auth_token');
  } catch {
    return null;
  }
}

export async function fetchJSON<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const base = getBaseUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      let error: string;
      try {
        const parsed = JSON.parse(body);
        error = parsed.error || parsed.message || body;
      } catch {
        error = body || `HTTP ${res.status}`;
      }
      return { ok: false, error, status: res.status };
    }

    const data = await res.json();
    return { ok: true, data, status: res.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, error: 'Request timed out', status: 408 };
    }
    if (err instanceof TypeError && (err as Error).message.includes('fetch')) {
      return { ok: false, error: 'Cannot connect to server', status: 0 };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      status: 0,
    };
  }
}

export interface SSECallbacks {
  onToken: (token: string) => void;
  onToolCall: (call: ToolCall) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
}

export async function streamChat(
  sessionId: string,
  message: string,
  callbacks: SSECallbacks,
  model?: string,
): Promise<void> {
  const base = getBaseUrl();
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${base}/api/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId, message, model }),
    });

    if (!res.ok) {
      const text = await res.text();
      callbacks.onError(text || `HTTP ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            callbacks.onComplete(fullText);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'token' && parsed.content) {
              fullText += parsed.content;
              callbacks.onToken(parsed.content);
            } else if (parsed.type === 'tool_call') {
              callbacks.onToolCall(parsed.toolCall);
            } else if (parsed.type === 'error') {
              callbacks.onError(parsed.message);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    callbacks.onComplete(fullText);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Connection failed');
  }
}

export interface WSMessage {
  type: string;
  payload: unknown;
}

export function connectWebSocket(
  onMessage: (msg: WSMessage) => void,
  onOpen?: () => void,
  onClose?: () => void,
  onError?: (err: Event) => void,
): WebSocket | null {
  const base = getBaseUrl();
  const token = getAuthToken();

  const protocol = base.startsWith('https') ? 'wss:' : 'ws:';
  const host = base.replace(/^https?:\/\//, '');
  const url = `${protocol}//${host}/ws${token ? `?token=${token}` : ''}`;

  try {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        onMessage(msg);
      } catch {
        // skip malformed messages
      }
    };

    ws.onclose = () => {
      onClose?.();
    };

    ws.onerror = (err) => {
      onError?.(err);
    };

    return ws;
  } catch {
    return null;
  }
}

export async function loginToServer(
  serverUrl: string,
  password: string,
): Promise<{ token: string; serverInfo: ServerInfo }> {
  const res = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Login failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchServerInfo(): Promise<ApiResponse<ServerInfo>> {
  return fetchJSON('/api/info');
}

export async function fetchSessions(): Promise<ApiResponse<ChatSession[]>> {
  return fetchJSON('/api/sessions');
}

export async function createSession(
  title?: string,
): Promise<ApiResponse<ChatSession>> {
  return fetchJSON('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function fetchSessionMessages(
  sessionId: string,
): Promise<ApiResponse<ChatMessage[]>> {
  return fetchJSON(`/api/sessions/${sessionId}/messages`);
}

export async function deleteSession(
  sessionId: string,
): Promise<ApiResponse<void>> {
  return fetchJSON(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function fetchModels(): Promise<ApiResponse<ModelInfo[]>> {
  return fetchJSON('/api/models');
}

export async function fetchMemoryLayers(): Promise<ApiResponse<MemoryLayer[]>> {
  return fetchJSON('/api/memory/layers');
}

export async function fetchMemoryEntries(
  layer: string,
): Promise<ApiResponse<MemoryEntry[]>> {
  return fetchJSON(`/api/memory/${layer}`);
}

export async function createMemoryEntry(
  layer: string,
  key: string,
  value: string,
): Promise<ApiResponse<MemoryEntry>> {
  return fetchJSON(`/api/memory/${layer}`, {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

export async function updateMemoryEntry(
  layer: string,
  id: string,
  value: string,
): Promise<ApiResponse<MemoryEntry>> {
  return fetchJSON(`/api/memory/${layer}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function deleteMemoryEntry(
  layer: string,
  id: string,
): Promise<ApiResponse<void>> {
  return fetchJSON(`/api/memory/${layer}/${id}`, { method: 'DELETE' });
}

export async function searchMemory(
  query: string,
): Promise<ApiResponse<MemoryEntry[]>> {
  return fetchJSON(`/api/memory/search?q=${encodeURIComponent(query)}`);
}

export async function fetchConnectors(): Promise<ApiResponse<McpConnector[]>> {
  return fetchJSON('/api/connectors');
}

export async function updateConnector(
  id: string,
  config: Record<string, unknown>,
): Promise<ApiResponse<McpConnector>> {
  return fetchJSON(`/api/connectors/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  });
}
