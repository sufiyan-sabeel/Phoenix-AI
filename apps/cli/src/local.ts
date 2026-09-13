import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { PhoenixConfig } from './config.js';
import { printToken, printToolCall, printToolResult, printError } from './output.js';

export interface LocalMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: unknown;
  error?: string;
}

export interface LocalSession {
  id: string;
  messages: LocalMessage[];
  mode: string;
  createdAt: number;
  updatedAt: number;
}

const DATA_DIR = join(homedir(), '.local', 'share', 'phoenix');
const SESSIONS_DIR = join(DATA_DIR, 'sessions');

function ensureDataDirs(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getSessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

export function createSession(mode: string = 'planner'): LocalSession {
  ensureDataDirs();
  
  const session: LocalSession = {
    id: randomUUID(),
    messages: [],
    mode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

export function loadSession(sessionId: string): LocalSession | null {
  const path = getSessionPath(sessionId);
  if (!existsSync(path)) return null;
  
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data) as LocalSession;
  } catch {
    return null;
  }
}

export function saveSession(session: LocalSession): void {
  ensureDataDirs();
  session.updatedAt = Date.now();
  writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
}

export function listSessions(): LocalSession[] {
  ensureDataDirs();
  
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  
  const sessions: LocalSession[] = [];
  for (const file of files) {
    try {
      const data = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
      sessions.push(JSON.parse(data) as LocalSession);
    } catch {
      // Skip invalid files
    }
  }
  
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(sessionId: string): boolean {
  const path = getSessionPath(sessionId);
  if (!existsSync(path)) return false;
  
  unlinkSync(path);
  return true;
}

export interface LocalOrchestrator {
  processMessage(message: string, session: LocalSession): AsyncGenerator<LocalMessage>;
}

export function createLocalOrchestrator(config: PhoenixConfig): LocalOrchestrator {
  return {
    async *processMessage(message: string, session: LocalSession): AsyncGenerator<LocalMessage> {
      const userMessage: LocalMessage = {
        id: randomUUID(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      session.messages.push(userMessage);
      
      const assistantMessage: LocalMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
        toolResults: [],
      };
      
      yield { ...assistantMessage };
      
      const systemPrompt = buildSystemPrompt(session.mode);
      const context = buildContext(session);
      
      // Simulate processing with provider
      const response = await processWithProvider(
        config.provider,
        config.model,
        systemPrompt,
        context,
        message
      );
      
      // Process tool calls if any
      if (response.toolCalls?.length) {
        for (const toolCall of response.toolCalls) {
          assistantMessage.toolCalls?.push(toolCall);
          yield { ...assistantMessage };
          
          const result = await executeToolCall(toolCall);
          assistantMessage.toolResults?.push(result);
          yield { ...assistantMessage };
        }
      }
      
      assistantMessage.content = response.content;
      session.messages.push(assistantMessage);
      yield { ...assistantMessage };
    },
  };
}

function buildSystemPrompt(mode: string): string {
  const base = `You are PHOENIX, an AI agent platform assistant.
You are running in ${mode} mode.
You have access to tools and can help with software engineering tasks.
Be concise and helpful.`;
  
  const modePrompts: Record<string, string> = {
    planner: 'Focus on breaking down tasks into steps and creating plans.',
    builder: 'Focus on implementing code and building solutions.',
    reviewer: 'Focus on reviewing code and providing feedback.',
    tester: 'Focus on writing and running tests.',
    debugger: 'Focus on finding and fixing bugs.',
  };
  
  return `${base}\n${modePrompts[mode] ?? ''}`;
}

function buildContext(session: LocalSession): string {
  return session.messages
    .slice(-10)
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
}

async function processWithProvider(
  provider: string,
  model: string,
  systemPrompt: string,
  context: string,
  message: string
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  // This would integrate with actual AI providers
  // For now, return a simulated response
  return {
    content: `[${provider}/${model}] Processing: ${message}`,
    toolCalls: undefined,
  };
}

async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  try {
    let result: unknown;
    
    switch (toolCall.name) {
      case 'read_file':
        result = await readFileTool(toolCall.arguments as { path: string });
        break;
      case 'write_file':
        result = await writeFileTool(toolCall.arguments as { path: string; content: string });
        break;
      case 'list_files':
        result = await listFilesTool(toolCall.arguments as { path?: string });
        break;
      case 'run_command':
        result = await runCommandTool(toolCall.arguments as { command: string });
        break;
      default:
        result = `Unknown tool: ${toolCall.name}`;
    }
    
    return { toolCallId: toolCall.id, content: result };
  } catch (error) {
    return {
      toolCallId: toolCall.id,
      content: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readFileTool(args: { path: string }): Promise<string> {
  const { readFileSync } = await import('node:fs');
  return readFileSync(args.path, 'utf-8');
}

async function writeFileTool(args: { path: string; content: string }): Promise<string> {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(args.path), { recursive: true });
  writeFileSync(args.path, args.content, 'utf-8');
  return `Written to ${args.path}`;
}

async function listFilesTool(args: { path?: string }): Promise<string[]> {
  const { readdirSync } = await import('node:fs');
  return readdirSync(args.path ?? '.');
}

async function runCommandTool(args: { command: string }): Promise<string> {
  const { execSync } = await import('node:child_process');
  return execSync(args.command, { encoding: 'utf-8', timeout: 30000 });
}

export function getLocalDataDir(): string {
  ensureDataDirs();
  return DATA_DIR;
}
