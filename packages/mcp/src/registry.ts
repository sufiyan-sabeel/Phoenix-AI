import type { MCPServer, MCPTool, ConnectorConfig, ConnectorState } from './types.js';
import { connect, listTools as clientListTools } from './client.js';
import { storeCredential, getCredential, deleteCredential } from './credentials.js';
import { checkPermission } from './permissions.js';

const servers = new Map<string, MCPServer>();
const configs = new Map<string, ConnectorConfig>();

export function addServer(config: ConnectorConfig): void {
  configs.set(config.id, config);
}

export function removeServer(id: string): void {
  servers.delete(id);
  configs.delete(id);
  deleteCredential(id);
}

export function enableServer(id: string): void {
  const config = configs.get(id);
  if (config) {
    config.enabled = true;
  }
}

export function disableServer(id: string): void {
  const config = configs.get(id);
  if (config) {
    config.enabled = false;
  }
  const server = servers.get(id);
  if (server) {
    server.status = 'disconnected';
    server.tools = [];
  }
}

export function listServers(): MCPServer[] {
  return Array.from(servers.values());
}

export function getServer(id: string): MCPServer | undefined {
  return servers.get(id);
}

export function listTools(): MCPTool[] {
  const allTools: MCPTool[] = [];
  for (const server of servers.values()) {
    if (server.status === 'connected') {
      allTools.push(...server.tools);
    }
  }
  return allTools;
}

export function getToolsByServer(serverId: string): MCPTool[] {
  const server = servers.get(serverId);
  if (!server || server.status !== 'connected') return [];
  return server.tools;
}

export async function connectServer(id: string): Promise<MCPServer> {
  const config = configs.get(id);
  if (!config) {
    throw new Error(`Server config "${id}" not found`);
  }
  if (!config.enabled) {
    throw new Error(`Server "${id}" is disabled`);
  }

  const server = servers.get(id);
  if (server?.status === 'connected') {
    return server;
  }

  const state: ConnectorState = 'connecting';
  if (server) server.status = state;

  try {
    const credentials = await getCredential(id);
    const newServer = await connect(config.endpoint, config.type, credentials);
    newServer.id = id;
    newServer.name = config.name;
    servers.set(id, newServer);
    return newServer;
  } catch (err) {
    const errorServer: MCPServer = {
      id,
      name: config.name,
      url: config.endpoint,
      transport: config.type,
      status: 'error',
      tools: [],
    };
    servers.set(id, errorServer);
    throw err;
  }
}

export async function disconnectServer(id: string): Promise<void> {
  const server = servers.get(id);
  if (server) {
    server.status = 'disconnected';
    server.tools = [];
  }
}

export async function refreshTools(id: string): Promise<MCPTool[]> {
  const server = servers.get(id);
  if (!server || server.status !== 'connected') return [];

  try {
    const tools = await clientListTools(server);
    server.tools = tools;
    return tools;
  } catch {
    server.status = 'error';
    server.tools = [];
    return [];
  }
}

export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const server = servers.get(serverId);
  if (!server) {
    throw new Error(`Server "${serverId}" not found`);
  }
  if (server.status !== 'connected') {
    throw new Error(`Server "${serverId}" is not connected`);
  }

  const { callTool: clientCallTool } = await import('./client.js');
  return clientCallTool(server, toolName, args);
}

export function getConfig(id: string): ConnectorConfig | undefined {
  return configs.get(id);
}

export function listConfigs(): ConnectorConfig[] {
  return Array.from(configs.values());
}
