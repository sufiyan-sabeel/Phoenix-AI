import { Command } from 'commander';
import { readConfig, getConfigValue } from '../config.js';
import { printBanner, printError, printSuccess, printInfo, printWarning, printStatus, printSection, printKeyValue, printEmpty, printJSON } from '../output.js';
import { spinner } from '../tui.js';
import { RemoteClient } from '../remote.js';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

interface CheckResult {
  name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check system requirements and configuration')
    .option('--json', 'Output as JSON')
    .option('--fix', 'Attempt to fix issues')
    .action(async (options) => {
      await doctorAction(options);
    });
}

interface DoctorOptions {
  json?: boolean;
  fix?: boolean;
}

async function doctorAction(options: DoctorOptions): Promise<void> {
  const checkSpinner = spinner('Running diagnostics...');
  const results: CheckResult[] = [];
  
  // System checks
  results.push(checkNodeVersion());
  results.push(checkNpmVersion());
  results.push(checkGit());
  results.push(checkConfigFile());
  
  // Configuration checks
  results.push(checkServerConfig());
  results.push(checkProviderConfig());
  
  // Connectivity checks
  if (getConfigValue<string>('server.mode') === 'remote') {
    const remoteResult = await checkRemoteConnection();
    results.push(remoteResult);
  }
  
  // MCP checks
  results.push(checkMcpServers());
  
  checkSpinner.stop();
  
  if (options.json) {
    printJSON({
      timestamp: new Date().toISOString(),
      results,
      passed: results.filter(r => r.status === 'success').length,
      warnings: results.filter(r => r.status === 'warning').length,
      errors: results.filter(r => r.status === 'error').length,
    });
    return;
  }
  
  // Display results
  printBanner();
  printSection('System Diagnostics');
  printEmpty();
  
  let hasErrors = false;
  let hasWarnings = false;
  
  for (const result of results) {
    const icon = result.status === 'success' ? '✓' : result.status === 'warning' ? '⚠' : '✗';
    const message = `${icon} ${result.name}: ${result.message}`;
    
    printStatus(result.status, message);
    
    if (result.details) {
      console.log(`    ${result.details}`);
    }
    
    if (result.status === 'error') hasErrors = true;
    if (result.status === 'warning') hasWarnings = true;
  }
  
  printEmpty();
  printSection('Summary');
  
  const passed = results.filter(r => r.status === 'success').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  printKeyValue('Passed', passed);
  printKeyValue('Warnings', warnings);
  printKeyValue('Errors', errors);
  printEmpty();
  
  if (errors === 0 && warnings === 0) {
    printSuccess('All checks passed! Phoenix is ready to use.');
  } else if (errors === 0) {
    printWarning('Some warnings detected. Phoenix should work but may have issues.');
  } else {
    printError('Some checks failed. Please fix the issues above.');
    printInfo('Run "phoenix config init" to set up configuration');
  }
  
  printEmpty();
  
  // Attempt fixes if requested
  if (options.fix && (hasErrors || hasWarnings)) {
    await attemptFixes(results);
  }
}

function checkNodeVersion(): CheckResult {
  try {
    const version = execSync('node --version', { encoding: 'utf-8' }).trim();
    const major = parseInt(version.slice(1).split('.')[0], 10);
    
    if (major >= 18) {
      return {
        name: 'Node.js',
        status: 'success',
        message: `${version}`,
      };
    }
    
    return {
      name: 'Node.js',
      status: 'warning',
      message: `${version} (18+ recommended)`,
      details: 'Some features may not work with older versions',
    };
  } catch {
    return {
      name: 'Node.js',
      status: 'error',
      message: 'Not found',
      details: 'Install Node.js 18+ from https://nodejs.org',
    };
  }
}

function checkNpmVersion(): CheckResult {
  try {
    const version = execSync('npm --version', { encoding: 'utf-8' }).trim();
    return {
      name: 'npm',
      status: 'success',
      message: `v${version}`,
    };
  } catch {
    return {
      name: 'npm',
      status: 'warning',
      message: 'Not found',
      details: 'npm is required for package management',
    };
  }
}

function checkGit(): CheckResult {
  try {
    const version = execSync('git --version', { encoding: 'utf-8' }).trim();
    return {
      name: 'Git',
      status: 'success',
      message: version.replace('git version ', 'v'),
    };
  } catch {
    return {
      name: 'Git',
      status: 'warning',
      message: 'Not found',
      details: 'Git is recommended for version control',
    };
  }
}

function checkConfigFile(): CheckResult {
  const configPath = join(homedir(), '.config', 'phoenix', 'config.json');
  
  if (existsSync(configPath)) {
    try {
      const config = readConfig();
      return {
        name: 'Config File',
        status: 'success',
        message: 'Exists',
        details: configPath,
      };
    } catch (error) {
      return {
        name: 'Config File',
        status: 'error',
        message: 'Invalid configuration',
        details: error instanceof Error ? error.message : 'Parse error',
      };
    }
  }
  
  return {
    name: 'Config File',
    status: 'warning',
    message: 'Not found',
    details: 'Run "phoenix config init" to create',
  };
}

function checkServerConfig(): CheckResult {
  const mode = getConfigValue<string>('server.mode');
  const url = getConfigValue<string>('server.url');
  
  if (!mode) {
    return {
      name: 'Server Mode',
      status: 'warning',
      message: 'Not configured',
      details: 'Run "phoenix config init"',
    };
  }
  
  if (mode === 'remote' && !url) {
    return {
      name: 'Server URL',
      status: 'error',
      message: 'Not configured',
      details: 'Set server.url in config',
    };
  }
  
  return {
    name: 'Server',
    status: 'success',
    message: `${mode} mode`,
    details: mode === 'remote' ? url : 'Embedded',
  };
}

function checkProviderConfig(): CheckResult {
  const provider = getConfigValue<string>('provider');
  const model = getConfigValue<string>('model');
  
  if (!provider) {
    return {
      name: 'AI Provider',
      status: 'warning',
      message: 'Not configured',
      details: 'Run "phoenix config init"',
    };
  }
  
  return {
    name: 'AI Provider',
    status: 'success',
    message: `${provider}/${model ?? 'default'}`,
  };
}

async function checkRemoteConnection(): Promise<CheckResult> {
  const serverUrl = getConfigValue<string>('server.url');
  const authToken = getConfigValue<string>('server.authToken');
  
  if (!serverUrl) {
    return {
      name: 'Remote Connection',
      status: 'error',
      message: 'No server URL configured',
    };
  }
  
  try {
    const client = new RemoteClient({
      server: { url: serverUrl, mode: 'remote', authToken },
      provider: getConfigValue<string>('provider') ?? 'openai',
      model: getConfigValue<string>('model') ?? 'gpt-4o',
      session: { autoSave: true },
      mcp: { servers: {} },
      ui: { color: true, streaming: true },
    });
    
    const connected = await client.connect();
    
    if (connected) {
      const status = await client.getStatus();
      return {
        name: 'Remote Connection',
        status: 'success',
        message: 'Connected',
        details: `Server v${status.version}, ${status.activeSessions} active sessions`,
      };
    }
    
    return {
      name: 'Remote Connection',
      status: 'error',
      message: 'Connection failed',
      details: `Unable to reach ${serverUrl}`,
    };
  } catch (error) {
    return {
      name: 'Remote Connection',
      status: 'error',
      message: 'Connection error',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkMcpServers(): CheckResult {
  const config = readConfig();
  const servers = Object.entries(config.mcp.servers);
  
  if (servers.length === 0) {
    return {
      name: 'MCP Servers',
      status: 'success',
      message: 'None configured',
    };
  }
  
  const enabled = servers.filter(([, s]) => s.enabled).length;
  const disabled = servers.length - enabled;
  
  const message = `${enabled} enabled, ${disabled} disabled`;
  
  return {
    name: 'MCP Servers',
    status: disabled > 0 ? 'warning' : 'success',
    message,
    details: servers.map(([name, s]) => `${name}: ${s.enabled ? 'enabled' : 'disabled'}`).join(', '),
  };
}

async function attemptFixes(results: CheckResult[]): Promise<void> {
  printSection('Attempting Fixes');
  
  const fixSpinner = spinner('Applying fixes...');
  
  for (const result of results) {
    if (result.status === 'error') {
      switch (result.name) {
        case 'Config File': {
          const { writeConfig } = await import('../config.js');
          writeConfig({
            server: { url: 'http://localhost:3000', mode: 'local' },
            provider: 'openai',
            model: 'gpt-4o',
            session: { autoSave: true },
            mcp: { servers: {} },
            ui: { color: true, streaming: true },
          });
          printSuccess('Created default config file');
          break;
        }
        
        case 'Server URL': {
          const { setConfigValue } = await import('../config.js');
          setConfigValue('server.url', 'http://localhost:3000');
          printSuccess('Set default server URL');
          break;
        }
        
        default:
          printWarning(`Cannot auto-fix: ${result.name}`);
      }
    }
  }
  
  fixSpinner.stop();
  printSuccess('Fixes applied');
  printInfo('Run "phoenix doctor" again to verify');
}
