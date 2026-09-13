import { exec, type ExecOptions } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

const execAsync = promisify(exec);

const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  'chmod -R 777 /',
  'chown -R',
  '> /dev/sda',
  'mv /* /dev/null',
];

function isCommandBlocked(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return BLOCKED_COMMANDS.some(blocked => normalized.includes(blocked));
}

function createTerminalTool(): Tool {
  return {
    name: 'execute_command',
    description: 'Execute a shell command in the terminal',
    category: 'terminal',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        cwd: { type: 'string', description: 'Working directory override' },
        env: {
          type: 'object',
          description: 'Additional environment variables',
          properties: {},
        },
      },
      required: ['command'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const command = args.command as string;
      const timeout = (args.timeout as number) || 30000;
      const cwd = (args.cwd as string) || context.workingDir;
      const extraEnv = (args.env as Record<string, string>) || {};

      if (isCommandBlocked(command)) {
        return {
          success: false,
          output: null,
          error: `Command is blocked for safety: ${command}`,
        };
      }

      const execOptions: ExecOptions = {
        cwd,
        timeout,
        env: { ...process.env, ...context.env, ...extraEnv },
        maxBuffer: 10 * 1024 * 1024,
      };

      try {
        const { stdout, stderr } = await execAsync(command, execOptions);
        return {
          success: true,
          output: { stdout, stderr },
          metadata: { command, cwd, timeout },
        };
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; stderr?: string; message?: string; code?: number };
        return {
          success: false,
          output: {
            stdout: execErr.stdout || '',
            stderr: execErr.stderr || '',
          },
          error: execErr.message || 'Command execution failed',
          metadata: { exitCode: execErr.code, command, cwd },
        };
      }
    },
  };
}

registerTool(createTerminalTool());
