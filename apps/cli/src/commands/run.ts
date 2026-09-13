import { Command } from 'commander';
import { getConfigValue } from '../config.js';
import { printBanner, printToken, printToolCall, printToolResult, printError, printSuccess, printInfo, printEmpty } from '../output.js';
import { spinner } from '../tui.js';
import { createSession, createLocalOrchestrator, type LocalSession } from '../local.js';
import { RemoteClient, streamRemoteMessage, type RemoteSession } from '../remote.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Execute a single task non-interactively')
    .argument('<task>', 'The task to execute')
    .option('-m, --mode <mode>', 'Operating mode', 'planner')
    .option('--model <model>', 'Override model')
    .option('--provider <provider>', 'Override provider')
    .option('--json', 'Output as JSON')
    .action(async (task, options) => {
      await runAction(task, options);
    });
}

interface RunOptions {
  mode: string;
  model?: string;
  provider?: string;
  json?: boolean;
}

async function runAction(task: string, options: RunOptions): Promise<void> {
  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await runRemote(task, options);
  } else {
    await runLocal(task, options);
  }
}

async function runLocal(task: string, options: RunOptions): Promise<void> {
  const config = {
    provider: options.provider ?? getConfigValue<string>('provider') ?? 'openai',
    model: options.model ?? getConfigValue<string>('model') ?? 'gpt-4o',
  };
  
  const session = createSession(options.mode);
  const orchestrator = createLocalOrchestrator({
    server: { url: '', mode: 'local' },
    provider: config.provider,
    model: config.model,
    session: { autoSave: true },
    mcp: { servers: {} },
    ui: { color: true, streaming: true },
  });
  
  const runSpinner = spinner('Processing task...');
  
  let output = '';
  
  process.on('SIGINT', () => {
    runSpinner.fail('Cancelled');
    process.exit(130);
  });
  
  try {
    for await (const message of orchestrator.processMessage(task, session)) {
      if (message.role === 'assistant') {
        if (message.content) {
          runSpinner.stop();
          
          if (options.json) {
            output += message.content;
          } else {
            printToken(message.content);
          }
        }
        
        if (message.toolCalls?.length) {
          for (const toolCall of message.toolCalls) {
            if (!options.json) {
              printToolCall(toolCall);
            }
          }
        }
        
        if (message.toolResults?.length) {
          for (const result of message.toolResults) {
            if (!options.json) {
              const toolName = message.toolCalls?.find(tc => tc.id === result.toolCallId)?.name ?? 'unknown';
              printToolResult(toolName, result.content);
            }
          }
        }
      }
    }
    
    runSpinner.succeed('Task completed');
    
    if (options.json) {
      console.log(JSON.stringify({
        sessionId: session.id,
        mode: options.mode,
        output,
        messages: session.messages.length,
      }, null, 2));
    }
    
    process.exit(0);
  } catch (error) {
    runSpinner.fail('Task failed');
    printError(error instanceof Error ? error : String(error));
    process.exit(1);
  }
}

async function runRemote(task: string, options: RunOptions): Promise<void> {
  const serverUrl = getConfigValue<string>('server.url') ?? 'http://localhost:3000';
  const authToken = getConfigValue<string>('server.authToken');
  
  const client = new RemoteClient({
    server: { url: serverUrl, mode: 'remote', authToken },
    provider: options.provider ?? getConfigValue<string>('provider') ?? 'openai',
    model: options.model ?? getConfigValue<string>('model') ?? 'gpt-4o',
    session: { autoSave: true },
    mcp: { servers: {} },
    ui: { color: true, streaming: true },
  });
  
  const connectSpinner = spinner('Connecting to server...');
  
  process.on('SIGINT', () => {
    connectSpinner.fail('Cancelled');
    client.cancel();
    process.exit(130);
  });
  
  const connected = await client.connect();
  connectSpinner.stop();
  
  if (!connected) {
    printError('Failed to connect to server');
    process.exit(1);
  }
  
  const sessionSpinner = spinner('Creating session...');
  const session = await client.createSession(options.mode);
  sessionSpinner.succeed(`Session ${session.id.slice(0, 8)} created`);
  
  const runSpinner = spinner('Processing task...');
  let output = '';
  
  try {
    await streamRemoteMessage(client, task, session.id, {
      onToken: (token) => {
        runSpinner.stop();
        
        if (options.json) {
          output += token;
        } else {
          printToken(token);
        }
        
        runSpinner.start('Processing...');
      },
      onToolCall: (toolCall) => {
        if (toolCall && !options.json) {
          runSpinner.stop();
          printToolCall(toolCall);
          runSpinner.start('Executing...');
        }
      },
      onToolResult: (toolResult) => {
        if (toolResult && !options.json) {
          runSpinner.stop();
          printToolResult('tool', toolResult.content);
          runSpinner.start('Processing...');
        }
      },
      onError: (error) => {
        runSpinner.fail('Error');
        printError(error);
      },
      onDone: () => {
        runSpinner.succeed('Task completed');
      },
    });
    
    if (options.json) {
      console.log(JSON.stringify({
        sessionId: session.id,
        mode: options.mode,
        output,
      }, null, 2));
    }
    
    process.exit(0);
  } catch (error) {
    runSpinner.fail('Task failed');
    printError(error instanceof Error ? error : String(error));
    process.exit(1);
  }
}
