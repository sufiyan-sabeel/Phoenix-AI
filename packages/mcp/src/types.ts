export type MCPTransport = 'sse' | 'stdio' | 'http';

export type ConnectorState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: MCPTransport;
  status: ConnectorState;
  tools: MCPTool[];
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: MCPTransport;
  endpoint: string;
  authType: 'none' | 'bearer' | 'api_key' | 'oauth2';
  credentials: Record<string, string>;
  scopes: string[];
  enabled: boolean;
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
