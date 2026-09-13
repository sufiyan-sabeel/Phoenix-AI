import { Command } from 'commander';
import readline from 'node:readline';
import { getConfigValue } from '../config.js';
import { printBanner, printToken, printToolCall, printToolResult, printError, printSuccess, printInfo, printStatus, printSection, printEmpty } from '../output.js';
import { spinner, clearScreen, hideCursor, showCursor, terminalSize } from '../tui.js';
import { createSession, loadSession, saveSession, createLocalOrchestrator, type LocalSession } from '../local.js';
import { RemoteClient, streamRemoteMessage, type RemoteSession } from '../remote.js';

const MODES = ['planner', 'builder', 'reviewer', 'tester', 'debugger'] as const;
type Mode = typeof MODES[number];

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-m, --mode <mode>', `Operating mode (${MODES.join(', ')})`, 'planner')
    .option('-s, --session <id>', 'Resume an existing session')
    .option('--model <model>', 'Override model configuration')
    .option('--provider <provider>', 'Override provider configuration')
    .action(async (options) => {
      await chatAction(options);
    });
}

interface ChatOptions {
  mode: string;
  session?: string;
  model?: string;
  provider?: string;
}

async function chatAction(options: ChatOptions): Promise<void> {
  const mode = validateMode(options.mode);
  if (!mode) {
    printError(`Invalid mode: ${options.mode}. Use one of: ${MODES.join(', ')}`);
    process.exit(1);
  }

  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await startRemoteChat(options, mode);
  } else {
    await startLocalChat(options, mode);
  }
}

function validateMode(mode: string): Mode | null {
  return MODES.includes(mode as Mode) ? (mode as Mode) : null;
}

async function startLocalChat(options: ChatOptions, mode: Mode): Promise<void> {
  clearScreen();
  printBanner();
  printInfo(`Starting local ${mode} session...`);
  printEmpty();
  
  const config = {
    provider: options.provider ?? getConfigValue<string>('provider') ?? 'openai',
    model: options.model ?? getConfigValue<string>('model') ?? 'gpt-4o',
  };
  
  let session: LocalSession;
  if (options.session) {
    const loaded = loadSession(options.session);
    if (!loaded) {
      printError(`Session ${options.session} not found`);
      process.exit(1);
    }
    session = loaded;
    printSuccess(`Resumed session ${session.id.slice(0, 8)}...`);
  } else {
    session = createSession(mode);
    printSuccess(`Created session ${session.id.slice(0, 8)}...`);
  }
  
  printInfo(`Mode: ${mode} | Provider: ${config.provider} | Model: ${config.model}`);
  printEmpty();
  
  const orchestrator = createLocalOrchestrator({
    server: { url: '', mode: 'local' },
    provider: config.provider,
    model: config.model,
    session: { autoSave: true },
    mcp: { servers: {} },
    ui: { color: true, streaming: true },
  });
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const sessionSpinner = spinner('Processing...');
  let isProcessing = false;
  
  const cleanup = (): void => {
    showCursor();
    printEmpty();
    printInfo('Session saved.');
    saveSession(session);
    rl.close();
  };
  
  process.on('SIGINT', () => {
    if (isProcessing) {
      printWarning('\nCancelling...');
      isProcessing = false;
      sessionSpinner.stop();
    } else {
      cleanup();
      process.exit(0);
    }
  });
  
  printEmpty();
  printInfo('Type your message or /help for commands');
  printEmpty();
  
  const promptUser = (): void => {
    rl.question(`${mode}> `, async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        promptUser();
        return;
      }
      
      if (trimmed === '/help') {
        showHelp();
        promptUser();
        return;
      }
      
      if (trimmed === '/quit' || trimmed === '/exit') {
        cleanup();
        process.exit(0);
      }
      
      if (trimmed === '/clear') {
        clearScreen();
        printBanner();
        promptUser();
        return;
      }
      
      if (trimmed === '/history') {
        showHistory(session);
        promptUser();
        return;
      }
      
      if (trimmed.startsWith('/mode ')) {
        const newMode = validateMode(trimmed.slice(6).trim());
        if (newMode) {
          session.mode = newMode;
          printSuccess(`Mode changed to ${newMode}`);
        } else {
          printError(`Invalid mode. Use one of: ${MODES.join(', ')}`);
        }
        promptUser();
        return;
      }
      
      isProcessing = true;
      sessionSpinner.start('Thinking...');
      
      try {
        for await (const message of orchestrator.processMessage(trimmed, session)) {
          if (message.role === 'assistant') {
            if (message.content) {
              sessionSpinner.stop();
              printEmpty();
              printToken(message.content);
              printEmpty();
              sessionSpinner.start('Processing...');
            }
            
            if (message.toolCalls?.length) {
              for (const toolCall of message.toolCalls) {
                sessionSpinner.stop();
                printToolCall(toolCall);
                sessionSpinner.start('Executing...');
              }
            }
            
            if (message.toolResults?.length) {
              for (const result of message.toolResults) {
                sessionSpinner.stop();
                const toolName = message.toolCalls?.find(tc => tc.id === result.toolCallId)?.name ?? 'unknown';
                printToolResult(toolName, result.content);
                sessionSpinner.start('Processing...');
              }
            }
          }
        }
        
        sessionSpinner.stop();
        saveSession(session);
      } catch (error) {
        sessionSpinner.fail('Error');
        printError(error instanceof Error ? error : String(error));
      }
      
      isProcessing = false;
      promptUser();
    });
  };
  
  promptUser();
}

async function startRemoteChat(options: ChatOptions, mode: Mode): Promise<void> {
  clearScreen();
  printBanner();
  printInfo(`Connecting to server...`);
  
  const serverUrl = getConfigValue<string>('server.url') ?? 'http://localhost:3000';
  const authToken = getConfigValue<string>('server.authToken');
  
  const { RemoteClient } = await import('../remote.js');
  const client = new RemoteClient({
    server: { url: serverUrl, mode: 'remote', authToken },
    provider: options.provider ?? getConfigValue<string>('provider') ?? 'openai',
    model: options.model ?? getConfigValue<string>('model') ?? 'gpt-4o',
    session: { autoSave: true },
    mcp: { servers: {} },
    ui: { color: true, streaming: true },
  });
  
  const connectSpinner = spinner('Connecting...');
  const connected = await client.connect();
  connectSpinner.stop();
  
  if (!connected) {
    printError('Failed to connect to server');
    process.exit(1);
  }
  
  let session: RemoteSession;
  if (options.session) {
    printInfo(`Resuming session ${options.session}...`);
    session = await client.resumeSession(options.session);
  } else {
    printInfo(`Creating ${mode} session...`);
    session = await client.createSession(mode);
  }
  
  printSuccess(`Session ${session.id.slice(0, 8)} ready`);
  printEmpty();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const processSpinner = spinner('Processing...');
  let isProcessing = false;
  
  const cleanup = (): void => {
    showCursor();
    printEmpty();
    rl.close();
  };
  
  process.on('SIGINT', () => {
    if (isProcessing) {
      printWarning('\nCancelling...');
      isProcessing = false;
      processSpinner.stop();
      client.cancel();
    } else {
      cleanup();
      process.exit(0);
    }
  });
  
  printInfo('Type your message or /help for commands');
  printEmpty();
  
  const promptUser = (): void => {
    rl.question(`${mode}> `, async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        promptUser();
        return;
      }
      
      if (trimmed === '/help') {
        showHelp();
        promptUser();
        return;
      }
      
      if (trimmed === '/quit' || trimmed === '/exit') {
        cleanup();
        process.exit(0);
      }
      
      if (trimmed === '/clear') {
        clearScreen();
        printBanner();
        promptUser();
        return;
      }
      
      isProcessing = true;
      processSpinner.start('Thinking...');
      
      try {
        await streamRemoteMessage(client, trimmed, session.id, {
          onToken: (token) => {
            processSpinner.stop();
            printToken(token);
            processSpinner.start('Processing...');
          },
          onToolCall: (toolCall) => {
            if (toolCall) {
              processSpinner.stop();
              printToolCall(toolCall);
              processSpinner.start('Executing...');
            }
          },
          onToolResult: (toolResult) => {
            if (toolResult) {
              processSpinner.stop();
              printToolResult('tool', toolResult.content);
              processSpinner.start('Processing...');
            }
          },
          onError: (error) => {
            processSpinner.fail('Error');
            printError(error);
          },
          onDone: () => {
            processSpinner.succeed('Done');
          },
        });
      } catch (error) {
        processSpinner.fail('Error');
        printError(error instanceof Error ? error : String(error));
      }
      
      isProcessing = false;
      printEmpty();
      promptUser();
    });
  };
  
  promptUser();
}

function showHelp(): void {
  printSection('Chat Commands');
  printInfo('/help - Show this help');
  printInfo('/mode <mode> - Change mode (planner/builder/reviewer/tester/debugger)');
  printInfo('/history - Show message history');
  printInfo('/clear - Clear screen');
  printInfo('/quit or /exit - Exit chat');
  printEmpty();
}

function showHistory(session: LocalSession): void {
  printSection('Message History');
  for (const msg of session.messages.slice(-10)) {
    const prefix = msg.role === 'user' ? 'You:' : 'AI:';
    console.log(`${prefix} ${msg.content.slice(0, 100)}...`);
  }
  printEmpty();
}
