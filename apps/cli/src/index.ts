#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initOutput, disableColor, printBanner, printError } from './output.js';
import { registerChatCommand } from './commands/chat.js';
import { registerRunCommand } from './commands/run.js';
import { registerSessionCommand } from './commands/session.js';
import { registerMcpCommand } from './commands/mcp.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDoctorCommand } from './commands/doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

async function main(): Promise<void> {
  // Handle NO_COLOR environment variable
  if (process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true') {
    disableColor();
  }
  
  // Initialize output system
  initOutput();
  
  const program = new Command();
  
  program
    .name('phoenix')
    .description('PHOENIX AI Agent Platform CLI')
    .version(getVersion())
    .option('--no-color', 'Disable colored output');
  
  // Handle --no-color flag
  program.on('option:no-color', () => {
    disableColor();
  });
  
  // Register all subcommands
  registerChatCommand(program);
  registerRunCommand(program);
  registerSessionCommand(program);
  registerMcpCommand(program);
  registerConfigCommand(program);
  registerDoctorCommand(program);
  
  // Default command - show banner and help
  program
    .command('welcome', { isDefault: true })
    .description('Show welcome message')
    .action(() => {
      printBanner();
      console.log('Welcome to PHOENIX AI Agent Platform!\n');
      console.log('Quick start:');
      console.log('  phoenix config init    Set up configuration');
      console.log('  phoenix chat           Start interactive chat');
      console.log('  phoenix run <task>     Execute a task');
      console.log('  phoenix doctor         Check system health\n');
      console.log('Run "phoenix --help" for all commands');
    });
  
  // Error handling
  program.exitOverride();
  
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a help/version exit (not an error)
      if (error.message.includes('outputHelp') || error.message.includes('version')) {
        process.exit(0);
      }
      
      // Check for commander.js error types
      if ('code' in error) {
        const commanderError = error as { code: string; message: string };
        
        if (commanderError.code === 'commander.helpDisplayed' || 
            commanderError.code === 'commander.version') {
          process.exit(0);
        }
        
        if (commanderError.code === 'commander.unknownCommand') {
          printError(`Unknown command: ${commanderError.message}`);
          console.log('Run "phoenix --help" for available commands');
          process.exit(1);
        }
        
        if (commanderError.code === 'commander.missingArgument') {
          printError(`Missing argument: ${commanderError.message}`);
          process.exit(1);
        }
      }
      
      printError(error.message);
      process.exit(1);
    }
    
    printError('An unexpected error occurred');
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  printError(error instanceof Error ? error : String(error));
  process.exit(1);
});
