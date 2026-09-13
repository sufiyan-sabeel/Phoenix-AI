import { Command } from 'commander';
import { readConfig, writeConfig, getConfigValue, setConfigValue, getConfigPath, resetConfig, type PhoenixConfig } from '../config.js';
import { printBanner, printError, printSuccess, printInfo, printStatus, printSection, printKeyValue, printEmpty, printJSON } from '../output.js';
import { confirm } from '../tui.js';

export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command('config')
    .description('Manage CLI configuration');

  configCommand
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await showConfigAction(options);
    });

  configCommand
    .command('get')
    .description('Get a config value')
    .argument('<key>', 'Config key (e.g., server.url)')
    .action(async (key) => {
      await getConfigAction(key);
    });

  configCommand
    .command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key')
    .argument('<value>', 'Value to set')
    .action(async (key, value) => {
      await setConfigAction(key, value);
    });

  configCommand
    .command('path')
    .description('Show config file path')
    .action(() => {
      printInfo(getConfigPath());
    });

  configCommand
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-f, --force', 'Skip confirmation')
    .action(async (options) => {
      await resetConfigAction(options);
    });

  configCommand
    .command('init')
    .description('Initialize configuration with interactive setup')
    .action(async () => {
      await initConfigAction();
    });
}

interface ShowOptions {
  json?: boolean;
}

async function showConfigAction(options: ShowOptions): Promise<void> {
  const config = readConfig();
  
  if (options.json) {
    printJSON(config);
    return;
  }
  
  printSection('Configuration');
  
  printStatus('info', 'Server');
  printKeyValue('  URL', config.server.url);
  printKeyValue('  Mode', config.server.mode);
  printKeyValue('  Auth Token', config.server.authToken ? '***configured***' : 'not set');
  printEmpty();
  
  printStatus('info', 'AI Provider');
  printKeyValue('  Provider', config.provider);
  printKeyValue('  Model', config.model);
  printEmpty();
  
  printStatus('info', 'Session');
  printKeyValue('  Auto Save', config.session.autoSave);
  printKeyValue('  Default Workspace', config.session.defaultWorkspace ?? 'not set');
  printEmpty();
  
  printStatus('info', 'UI');
  printKeyValue('  Color', config.ui.color);
  printKeyValue('  Streaming', config.ui.streaming);
  printEmpty();
  
  const mcpCount = Object.keys(config.mcp.servers).length;
  printStatus('info', 'MCP');
  printKeyValue('  Servers', `${mcpCount} configured`);
  printEmpty();
  
  printInfo(`Config file: ${getConfigPath()}`);
}

async function getConfigAction(key: string): Promise<void> {
  const value = getConfigValue(key);
  
  if (value === undefined) {
    printError(`Key '${key}' not found`);
    process.exit(1);
  }
  
  if (typeof value === 'object') {
    printJSON(value);
  } else {
    console.log(String(value));
  }
}

async function setConfigAction(key: string, value: string): Promise<void> {
  try {
    setConfigValue(key, value);
    printSuccess(`Set ${key} = ${value}`);
  } catch (error) {
    printError(error instanceof Error ? error : String(error));
    process.exit(1);
  }
}

async function resetConfigAction(options: { force?: boolean }): Promise<void> {
  if (!options.force) {
    const confirmed = await confirm('Reset configuration to defaults?', false);
    if (!confirmed) {
      printInfo('Cancelled');
      return;
    }
  }
  
  resetConfig();
  printSuccess('Configuration reset to defaults');
}

async function initConfigAction(): Promise<void> {
  printSection('Phoenix CLI Configuration Setup');
  printEmpty();
  
  const { prompt } = await import('../tui.js');
  const { select } = await import('../tui.js');
  
  // Server mode
  const mode = await select('Server mode', [
    { name: 'Local - Run AI locally', value: 'local' },
    { name: 'Remote - Connect to Phoenix server', value: 'remote' },
  ]);
  
  setConfigValue('server.mode', mode);
  
  // Server URL (if remote)
  if (mode === 'remote') {
    const url = await prompt('Server URL', 'http://localhost:3000');
    setConfigValue('server.url', url);
    
    const authToken = await prompt('Auth token (optional)', '');
    if (authToken) {
      setConfigValue('server.authToken', authToken);
    }
  }
  
  // Provider
  const provider = await select('AI Provider', [
    { name: 'OpenAI', value: 'openai' },
    { name: 'Anthropic', value: 'anthropic' },
    { name: 'Google', value: 'google' },
    { name: 'Azure', value: 'azure' },
    { name: 'Ollama (Local)', value: 'ollama' },
  ]);
  
  setConfigValue('provider', provider);
  
  // Model
  const defaultModels: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-2.0-flash',
    azure: 'gpt-4o',
    ollama: 'llama3.2',
  };
  
  const model = await prompt('Model', defaultModels[provider] ?? 'gpt-4o');
  setConfigValue('model', model);
  
  // UI settings
  const colorEnabled = await confirm('Enable colored output?', true);
  setConfigValue('ui.color', colorEnabled);
  
  const streamingEnabled = await confirm('Enable streaming output?', true);
  setConfigValue('ui.streaming', streamingEnabled);
  
  printEmpty();
  printSuccess('Configuration saved!');
  printInfo(`Config file: ${getConfigPath()}`);
  printEmpty();
  printInfo('Run "phoenix chat" to start a session');
  printInfo('Run "phoenix doctor" to verify setup');
}
