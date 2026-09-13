import type { ZapierConfig, ZapierAction } from './types.js';

export interface ZapierMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ZapierMCPServer {
  name: string;
  tools: ZapierMCPTool[];
}

export class ZapierIntegration {
  private config: ZapierConfig;
  private connected = false;
  private servers: ZapierMCPServer[] = [];
  private tools: ZapierMCPTool[] = [];

  constructor(config: ZapierConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        this.connected = true;
        await this.loadTools();
        return true;
      }

      this.connected = false;
      return false;
    } catch {
      this.connected = false;
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    this.servers = [];
    this.tools = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listActions(): Promise<ZapierAction[]> {
    if (!this.connected) {
      throw new Error('Not connected to Zapier MCP server');
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/tools`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to list actions: ${response.statusText}`);
      }

      const data = (await response.json()) as { tools?: ZapierMCPTool[] };
      return (data.tools ?? []).map((tool) => ({
        app: this.extractApp(tool.name),
        action: tool.name,
        selectedApi: tool.name,
        toolName: tool.name,
        params: (tool.inputSchema as Record<string, unknown>) ?? {},
      }));
    } catch (error) {
      throw new Error(`Failed to list Zapier actions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async executeAction(action: ZapierAction, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected to Zapier MCP server');
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/tools/${action.toolName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ input: params }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Action failed (${response.status}): ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to execute Zapier action: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected to Zapier MCP server');
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/tools/${toolName}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ arguments: args }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Tool call failed (${response.status}): ${errorBody}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw new Error(`Failed to call Zapier tool: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getTools(): ZapierMCPTool[] {
    return this.tools;
  }

  getTool(name: string): ZapierMCPTool | undefined {
    return this.tools.find((t) => t.name === name);
  }

  searchTools(query: string): ZapierMCPTool[] {
    const lowerQuery = query.toLowerCase();
    return this.tools.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery)
    );
  }

  private async loadTools(): Promise<void> {
    try {
      const response = await fetch(`${this.config.serverUrl}/tools`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = (await response.json()) as { tools?: ZapierMCPTool[] };
        this.tools = data.tools ?? [];
      }
    } catch {
      this.tools = [];
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private extractApp(toolName: string): string {
    const parts = toolName.split('_');
    return parts[0] ?? toolName;
  }
}