import { Command } from 'commander';
import { readConfig, writeConfig, getConfigValue } from '../config.js';
import { printError, printSuccess, printInfo, printStatus, printSection, printTable, printEmpty, printJSON } from '../output.js';
import { spinner, prompt, confirm } from '../tui.js';

export function registerMcpCommand(program: Command): void {
  const mcpCommand = program
    .command('mcp')
    .description('Manage MCP server connections');

  mcpCommand
    .command('add')
    .description('Add an MCP server')
    .argument('[url]', 'Server URL')
    .option('-n, --name <name>', 'Server name')
    .option('--headers <headers>', 'Custom headers (JSON)')
    .action(async (url, options) => {
      await addServerAction(url, options);
    });

  mcpCommand
    .command('list')
    .description('List connected MCP servers')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await listServersAction(options);
    });

  mcpCommand
    .command('remove')
    .description('Remove an MCP server')
    .argument('[name]', 'Server name')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name, options) => {
      await removeServerAction(name, options);
    });

  mcpCommand
    .command('status')
    .description('Show MCP server status')
    .argument('[name]', 'Server name (all if omitted)')
    .action(async (name) => {
      await statusAction(name);
    });

  mcpCommand
    .command('enable')
    .description('Enable an MCP server')
    .argument('<name>', 'Server name')
    .action(async (name) => {
      await enableServerAction(name);
    });

  mcpCommand
    .command('disable')
    .description('Disable an MCP server')
    .argument('<name>', 'Server name')
    .action(async (name) => {
      await disableServerAction(name);
    });
}

interface AddOptions {
  name?: string;
  headers?: string;
}

async function addServerAction(url?: string, options: AddOptions = {}): Promise<void> {
  let serverUrl = url;
  let serverName = options.name;
  
  if (!serverUrl) {
    serverUrl = await prompt('Server URL');
  }
  
  if (!serverUrl) {
    printError('URL is required');
    process.exit(1);
  }
  
  if (!serverName) {
    serverName = await prompt('Server name', extractNameFromUrl(serverUrl));
  }
  
  let headers: Record<string, string> | undefined;
  if (options.headers) {
    try {
      headers = JSON.parse(options.headers);
    } catch {
      printError('Invalid headers JSON');
      process.exit(1);
    }
  }
  
  const addSpinner = spinner('Adding server...');
  
  try {
    const config = readConfig();
    
    if (config.mcp.servers[serverName]) {
      addSpinner.stop();
      printError(`Server '${serverName}' already exists`);
      process.exit(1);
    }
    
    const testSpinner = spinner('Testing connection...');
    const connected = await testMcpConnection(serverUrl, headers);
    testSpinner.stop();
    
    if (!connected) {
      printStatus('warning', 'Server added but connection test failed');
    }
    
    config.mcp.servers[serverName] = {
      url: serverUrl,
      enabled: true,
      headers,
    };
    
    writeConfig(config);
    addSpinner.succeed(`Server '${serverName}' added`);
    
    if (connected) {
      printSuccess('Connection verified');
    }
  } catch (error) {
    addSpinner.fail('Failed to add server');
    printError(error instanceof Error ? error : String(error));
  }
}

interface ListOptions {
  json?: boolean;
}

async function listServersAction(options: ListOptions): Promise<void> {
  const config = readConfig();
  const servers = config.mcp.servers;
  const entries = Object.entries(servers);
  
  if (entries.length === 0) {
    printInfo('No MCP servers configured');
    printInfo('Use "phoenix mcp add <url>" to add a server');
    return;
  }
  
  if (options.json) {
    printJSON(entries.map(([name, server]) => ({
      name,
      url: server.url,
      enabled: server.enabled,
      hasHeaders: !!server.headers,
    })));
    return;
  }
  
  printSection('MCP Servers');
  
  const headers = ['Name', 'URL', 'Status'];
  const rows = entries.map(([name, server]) => [
    name,
    server.url,
    server.enabled ? '✓ Enabled' : '✗ Disabled',
  ]);
  
  printTable(headers, rows);
  printEmpty();
  printInfo(`${entries.length} server(s) configured`);
}

async function removeServerAction(name?: string, options: { force?: boolean } = {}): Promise<void> {
  const config = readConfig();
  const servers = Object.keys(config.mcp.servers);
  
  if (servers.length === 0) {
    printInfo('No MCP servers configured');
    return;
  }
  
  let serverName = name;
  
  if (!serverName) {
    const { select } = await import('../tui.js');
    const choices = servers.map(s => ({
      name: `${s} (${config.mcp.servers[s].url})`,
      value: s,
    }));
    serverName = await select('Select a server to remove', choices);
  }
  
  if (!config.mcp.servers[serverName]) {
    printError(`Server '${serverName}' not found`);
    process.exit(1);
  }
  
  if (!options.force) {
    const confirmed = await confirm(`Remove server '${serverName}'?`, false);
    if (!confirmed) {
      printInfo('Cancelled');
      return;
    }
  }
  
  delete config.mcp.servers[serverName];
  writeConfig(config);
  
  printSuccess(`Server '${serverName}' removed`);
}

async function statusAction(name?: string): Promise<void> {
  const config = readConfig();
  const servers = Object.entries(config.mcp.servers);
  
  if (servers.length === 0) {
    printInfo('No MCP servers configured');
    return;
  }
  
  const targets = name 
    ? servers.filter(([n]) => n === name)
    : servers;
  
  if (targets.length === 0) {
    printError(`Server '${name}' not found`);
    process.exit(1);
  }
  
  printSection('MCP Server Status');
  
  for (const [serverName, server] of targets) {
    const checkSpinner = spinner(`Checking ${serverName}...`);
    
    try {
      const connected = await testMcpConnection(server.url, server.headers);
      checkSpinner.stop();
      
      printStatus(
        connected ? 'success' : 'error',
        `${serverName}: ${server.url} - ${connected ? 'Connected' : 'Disconnected'}`
      );
    } catch (error) {
      checkSpinner.stop();
      printStatus('error', `${serverName}: ${server.url} - Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function enableServerAction(name: string): Promise<void> {
  const config = readConfig();
  
  if (!config.mcp.servers[name]) {
    printError(`Server '${name}' not found`);
    process.exit(1);
  }
  
  config.mcp.servers[name].enabled = true;
  writeConfig(config);
  
  printSuccess(`Server '${name}' enabled`);
}

async function disableServerAction(name: string): Promise<void> {
  const config = readConfig();
  
  if (!config.mcp.servers[name]) {
    printError(`Server '${name}' not found`);
    process.exit(1);
  }
  
  config.mcp.servers[name].enabled = false;
  writeConfig(config);
  
  printSuccess(`Server '${name}' disabled`);
}

function extractNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/\./g, '-');
  } catch {
    return 'mcp-server';
  }
}

async function testMcpConnection(url: string, headers?: Record<string, string>): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'phoenix-cli',
            version: '0.1.0',
          },
        },
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}
