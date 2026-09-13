import type { MCPServer, MCPTool, MCPTransport, MCPMessage } from './types.js';

let messageId = 0;

function nextId(): number {
  return ++messageId;
}

async function sendRequest(
  url: string,
  message: MCPMessage,
  headers?: Record<string, string>
): Promise<MCPMessage> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<MCPMessage>;
}

async function initializeSSE(url: string, headers?: Record<string, string>): Promise<MCPServer> {
  const serverUrl = new URL(url);
  const sseUrl = `${serverUrl.origin}/sse`;

  const initMessage: MCPMessage = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'phoenix-mcp-client', version: '0.1.0' },
    },
  };

  const response = await fetch(sseUrl, {
    headers: { Accept: 'text/event-stream', ...headers },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let endpoint = '';

  const readEvent = (): Promise<{ event: string; data: string }> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SSE read timeout')), 15000);
      const processBuffer = () => {
        const lines = buffer.split('\n');
        let event = '';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.substring(6).trim();
          if (line.startsWith('data:')) data = line.substring(5).trim();
        }
        if (data) {
          clearTimeout(timeout);
          resolve({ event, data });
        }
      };

      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) { clearTimeout(timeout); reject(new Error('SSE stream ended')); return; }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      };
      pump().catch(reject);
    });
  };

  const endpointEvent = await readEvent();
  endpoint = endpointEvent.data;

  const messageUrl = new URL(endpoint, sseUrl).toString();
  const initResponse = await sendRequest(messageUrl, initMessage, headers);

  if (initResponse.error) {
    throw new Error(`MCP init error: ${initResponse.error.message}`);
  }

  await sendRequest(messageUrl, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, headers);

  const toolsResponse = await sendRequest(messageUrl, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
  }, headers);

  const tools = (toolsResponse.result as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> })?.tools || [];

  return {
    id: url,
    name: url,
    url: messageUrl,
    transport: 'sse',
    status: 'connected',
    tools: tools.map(t => ({ ...t, serverId: url })),
  };
}

async function initializeHTTP(url: string, headers?: Record<string, string>): Promise<MCPServer> {
  const initMessage: MCPMessage = {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'phoenix-mcp-client', version: '0.1.0' },
    },
  };

  const initResponse = await sendRequest(url, initMessage, headers);
  if (initResponse.error) {
    throw new Error(`MCP init error: ${initResponse.error.message}`);
  }

  await sendRequest(url, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }, headers);

  const toolsResponse = await sendRequest(url, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
  }, headers);

  const tools = (toolsResponse.result as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> })?.tools || [];

  return {
    id: url,
    name: url,
    url,
    transport: 'http',
    status: 'connected',
    tools: tools.map(t => ({ ...t, serverId: url })),
  };
}

export async function connect(
  url: string,
  transport: MCPTransport,
  credentials?: Record<string, string>
): Promise<MCPServer> {
  const headers: Record<string, string> = {};
  if (credentials?.token) {
    headers['Authorization'] = `Bearer ${credentials.token}`;
  }
  if (credentials?.api_key) {
    headers['X-API-Key'] = credentials.api_key;
  }

  switch (transport) {
    case 'sse':
      return initializeSSE(url, Object.keys(headers).length ? headers : undefined);
    case 'http':
      return initializeHTTP(url, Object.keys(headers).length ? headers : undefined);
    case 'stdio':
      throw new Error('stdio transport not supported in browser context');
    default:
      throw new Error(`Unknown transport: ${transport}`);
  }
}

export async function listTools(server: MCPServer): Promise<MCPTool[]> {
  if (server.status !== 'connected') return [];

  const headers: Record<string, string> = {};
  const response = await sendRequest(server.url, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
  }, Object.keys(headers).length ? headers : undefined);

  const tools = (response.result as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> })?.tools || [];
  return tools.map(t => ({ ...t, serverId: server.id }));
}

export async function callTool(
  server: MCPServer,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (server.status !== 'connected') {
    throw new Error(`Server ${server.id} is not connected`);
  }

  const response = await sendRequest(server.url, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/call',
    params: { name, arguments: args },
  });

  if (response.error) {
    throw new Error(`Tool call error: ${response.error.message}`);
  }

  return response.result;
}

export async function reconnect(
  server: MCPServer,
  credentials?: Record<string, string>,
  maxRetries = 3,
  delayMs = 2000
): Promise<MCPServer> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const newServer = await connect(server.url, server.transport, credentials);
      return newServer;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('Reconnection failed after max retries');
}
