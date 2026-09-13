import { Command } from 'commander';
import { getConfigValue } from '../config.js';
import { printBanner, printError, printSuccess, printInfo, printStatus, printSection, printTable, printEmpty, printJSON } from '../output.js';
import { spinner, confirm, select } from '../tui.js';
import { listSessions, loadSession, deleteSession, type LocalSession } from '../local.js';
import { RemoteClient, type RemoteSession } from '../remote.js';

export function registerSessionCommand(program: Command): void {
  const sessionCommand = program
    .command('session')
    .description('Manage chat sessions');

  sessionCommand
    .command('list')
    .description('List all sessions')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await listSessionsAction(options);
    });

  sessionCommand
    .command('resume')
    .description('Resume a session by ID')
    .argument('[id]', 'Session ID (will prompt if not provided)')
    .action(async (id) => {
      await resumeSessionAction(id);
    });

  sessionCommand
    .command('delete')
    .description('Delete a session')
    .argument('[id]', 'Session ID (will prompt if not provided)')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, options) => {
      await deleteSessionAction(id, options);
    });

  sessionCommand
    .command('info')
    .description('Show session details')
    .argument('<id>', 'Session ID')
    .option('--json', 'Output as JSON')
    .action(async (id, options) => {
      await sessionInfoAction(id, options);
    });
}

interface ListOptions {
  json?: boolean;
}

async function listSessionsAction(options: ListOptions): Promise<void> {
  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await listRemoteSessions(options);
  } else {
    await listLocalSessions(options);
  }
}

async function listLocalSessions(options: ListOptions): Promise<void> {
  const listSpinner = spinner('Loading sessions...');
  
  try {
    const sessions = listSessions();
    listSpinner.stop();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    if (options.json) {
      printJSON(sessions.map(s => ({
        id: s.id,
        mode: s.mode,
        messages: s.messages.length,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.updatedAt).toISOString(),
      })));
      return;
    }
    
    printSection('Sessions');
    
    const headers = ['ID', 'Mode', 'Messages', 'Created', 'Updated'];
    const rows = sessions.map(s => [
      s.id.slice(0, 8) + '...',
      s.mode,
      String(s.messages.length),
      formatDate(s.createdAt),
      formatDate(s.updatedAt),
    ]);
    
    printTable(headers, rows);
    printEmpty();
    printInfo(`${sessions.length} session(s) found`);
  } catch (error) {
    listSpinner.fail('Failed to load sessions');
    printError(error instanceof Error ? error : String(error));
  }
}

async function listRemoteSessions(options: ListOptions): Promise<void> {
  const listSpinner = spinner('Loading sessions...');
  
  try {
    const client = createRemoteClient();
    const connected = await client.connect();
    
    if (!connected) {
      listSpinner.fail('Failed to connect to server');
      process.exit(1);
    }
    
    const sessions = await client.listSessions();
    listSpinner.stop();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    if (options.json) {
      printJSON(sessions.map(s => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        messages: s.messages.length,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.updatedAt).toISOString(),
      })));
      return;
    }
    
    printSection('Sessions');
    
    const headers = ['ID', 'Mode', 'Status', 'Messages', 'Created', 'Updated'];
    const rows = sessions.map(s => [
      s.id.slice(0, 8) + '...',
      s.mode,
      s.status,
      String(s.messages.length),
      formatDate(s.createdAt),
      formatDate(s.updatedAt),
    ]);
    
    printTable(headers, rows);
    printEmpty();
    printInfo(`${sessions.length} session(s) found`);
  } catch (error) {
    listSpinner.fail('Failed to load sessions');
    printError(error instanceof Error ? error : String(error));
  }
}

async function resumeSessionAction(id?: string): Promise<void> {
  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await resumeRemoteSession(id);
  } else {
    await resumeLocalSession(id);
  }
}

async function resumeLocalSession(id?: string): Promise<void> {
  let sessionId = id;
  
  if (!sessionId) {
    const sessions = listSessions();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    const choices = sessions.map(s => ({
      name: `${s.id.slice(0, 8)}... (${s.mode}, ${s.messages.length} messages)`,
      value: s.id,
    }));
    
    sessionId = await select('Select a session to resume', choices);
  }
  
  const loadSpinner = spinner('Loading session...');
  const session = loadSession(sessionId);
  loadSpinner.stop();
  
  if (!session) {
    printError(`Session ${sessionId} not found`);
    process.exit(1);
  }
  
  printSuccess(`Session ${session.id.slice(0, 8)} loaded`);
  printInfo(`Mode: ${session.mode} | Messages: ${session.messages.length}`);
  printEmpty();
  printInfo(`Run 'phoenix chat -s ${session.id}' to resume`);
}

async function resumeRemoteSession(id?: string): Promise<void> {
  const client = createRemoteClient();
  
  const connectSpinner = spinner('Connecting...');
  const connected = await client.connect();
  connectSpinner.stop();
  
  if (!connected) {
    printError('Failed to connect to server');
    process.exit(1);
  }
  
  let sessionId = id;
  
  if (!sessionId) {
    const sessions = await client.listSessions();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    const choices = sessions.map(s => ({
      name: `${s.id.slice(0, 8)}... (${s.mode}, ${s.status})`,
      value: s.id,
    }));
    
    sessionId = await select('Select a session to resume', choices);
  }
  
  const loadSpinner = spinner('Resuming session...');
  const session = await client.resumeSession(sessionId);
  loadSpinner.stop();
  
  printSuccess(`Session ${session.id.slice(0, 8)} resumed`);
  printInfo(`Mode: ${session.mode} | Messages: ${session.messages.length}`);
  printEmpty();
  printInfo(`Run 'phoenix chat -s ${session.id}' to continue`);
}

async function deleteSessionAction(id?: string, options: { force?: boolean } = {}): Promise<void> {
  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await deleteRemoteSession(id, options);
  } else {
    await deleteLocalSession(id, options);
  }
}

async function deleteLocalSession(id?: string, options: { force?: boolean } = {}): Promise<void> {
  let sessionId = id;
  
  if (!sessionId) {
    const sessions = listSessions();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    const choices = sessions.map(s => ({
      name: `${s.id.slice(0, 8)}... (${s.mode}, ${s.messages.length} messages)`,
      value: s.id,
    }));
    
    sessionId = await select('Select a session to delete', choices);
  }
  
  if (!options.force) {
    const confirmed = await confirm(`Delete session ${sessionId.slice(0, 8)}?`, false);
    if (!confirmed) {
      printInfo('Cancelled');
      return;
    }
  }
  
  const deleteSpinner = spinner('Deleting session...');
  const deleted = deleteSession(sessionId);
  deleteSpinner.stop();
  
  if (deleted) {
    printSuccess(`Session ${sessionId.slice(0, 8)} deleted`);
  } else {
    printError(`Session ${sessionId} not found`);
  }
}

async function deleteRemoteSession(id?: string, options: { force?: boolean } = {}): Promise<void> {
  const client = createRemoteClient();
  
  const connectSpinner = spinner('Connecting...');
  const connected = await client.connect();
  connectSpinner.stop();
  
  if (!connected) {
    printError('Failed to connect to server');
    process.exit(1);
  }
  
  let sessionId = id;
  
  if (!sessionId) {
    const sessions = await client.listSessions();
    
    if (sessions.length === 0) {
      printInfo('No sessions found');
      return;
    }
    
    const choices = sessions.map(s => ({
      name: `${s.id.slice(0, 8)}... (${s.mode}, ${s.status})`,
      value: s.id,
    }));
    
    sessionId = await select('Select a session to delete', choices);
  }
  
  if (!options.force) {
    const confirmed = await confirm(`Delete session ${sessionId.slice(0, 8)}?`, false);
    if (!confirmed) {
      printInfo('Cancelled');
      return;
    }
  }
  
  const deleteSpinner = spinner('Deleting session...');
  await client.deleteSession(sessionId);
  deleteSpinner.stop();
  
  printSuccess(`Session ${sessionId.slice(0, 8)} deleted`);
}

async function sessionInfoAction(id: string, options: { json?: boolean }): Promise<void> {
  const serverMode = getConfigValue<string>('server.mode') ?? 'local';
  
  if (serverMode === 'remote') {
    await remoteSessionInfo(id, options);
  } else {
    await localSessionInfo(id, options);
  }
}

async function localSessionInfo(id: string, options: { json?: boolean }): Promise<void> {
  const loadSpinner = spinner('Loading session...');
  const session = loadSession(id);
  loadSpinner.stop();
  
  if (!session) {
    printError(`Session ${id} not found`);
    process.exit(1);
  }
  
  if (options.json) {
    printJSON({
      id: session.id,
      mode: session.mode,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
    });
    return;
  }
  
  printSection('Session Info');
  printStatus('info', `ID: ${session.id}`);
  printStatus('info', `Mode: ${session.mode}`);
  printStatus('info', `Messages: ${session.messages.length}`);
  printStatus('info', `Created: ${formatDate(session.createdAt)}`);
  printStatus('info', `Updated: ${formatDate(session.updatedAt)}`);
  printEmpty();
  
  if (session.messages.length > 0) {
    printSection('Recent Messages');
    for (const msg of session.messages.slice(-5)) {
      const prefix = msg.role === 'user' ? 'You:' : 'AI:';
      const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '');
      console.log(`${prefix} ${preview}`);
    }
  }
}

async function remoteSessionInfo(id: string, options: { json?: boolean }): Promise<void> {
  const client = createRemoteClient();
  
  const connectSpinner = spinner('Connecting...');
  const connected = await client.connect();
  connectSpinner.stop();
  
  if (!connected) {
    printError('Failed to connect to server');
    process.exit(1);
  }
  
  const loadSpinner = spinner('Loading session...');
  const session = await client.getSession(id);
  loadSpinner.stop();
  
  if (options.json) {
    printJSON({
      id: session.id,
      mode: session.mode,
      status: session.status,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
    });
    return;
  }
  
  printSection('Session Info');
  printStatus('info', `ID: ${session.id}`);
  printStatus('info', `Mode: ${session.mode}`);
  printStatus('info', `Status: ${session.status}`);
  printStatus('info', `Messages: ${session.messages.length}`);
  printStatus('info', `Created: ${formatDate(session.createdAt)}`);
  printStatus('info', `Updated: ${formatDate(session.updatedAt)}`);
}

function createRemoteClient(): RemoteClient {
  const serverUrl = getConfigValue<string>('server.url') ?? 'http://localhost:3000';
  const authToken = getConfigValue<string>('server.authToken');
  
  return new RemoteClient({
    server: { url: serverUrl, mode: 'remote', authToken },
    provider: getConfigValue<string>('provider') ?? 'openai',
    model: getConfigValue<string>('model') ?? 'gpt-4o',
    session: { autoSave: true },
    mcp: { servers: {} },
    ui: { color: true, streaming: true },
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}
