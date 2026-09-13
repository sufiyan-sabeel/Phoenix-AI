import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

const execAsync = promisify(exec);

async function gitExec(args: string[], cwd: string, timeout = 15000): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execAsync(`git ${args.join(' ')}`, { cwd, timeout, maxBuffer: 5 * 1024 * 1024 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function createGitStatusTool(): Tool {
  return {
    name: 'git_status',
    description: 'Get the current git status',
    category: 'git',
    parameters: { type: 'object', properties: {} },
    async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const { stdout } = await gitExec(['status', '--porcelain'], context.workingDir);
        const files = stdout.split('\n').filter(Boolean).map(line => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }));
        return { success: true, output: { files, raw: stdout } };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitDiffTool(): Tool {
  return {
    name: 'git_diff',
    description: 'Show changes in the working tree',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Show staged changes' },
        file: { type: 'string', description: 'Specific file to diff' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const cmdArgs = ['diff'];
        if (args.staged) cmdArgs.push('--staged');
        if (args.file) cmdArgs.push(args.file as string);
        const { stdout } = await gitExec(cmdArgs, context.workingDir);
        return { success: true, output: stdout || 'No changes' };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitLogTool(): Tool {
  return {
    name: 'git_log',
    description: 'Show commit history',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of commits to show (default: 10)' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const count = (args.count as number) || 10;
        const { stdout } = await gitExec(
          ['log', `--max-count=${count}`, '--pretty=format:%H|%an|%ae|%ai|%s'],
          context.workingDir
        );
        const commits = stdout.split('\n').filter(Boolean).map(line => {
          const [hash, author, email, date, ...messageParts] = line.split('|');
          return { hash, author, email, date, message: messageParts.join('|') };
        });
        return { success: true, output: commits };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitCommitTool(): Tool {
  return {
    name: 'git_commit',
    description: 'Stage all changes and create a commit',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: {
          type: 'array',
          description: 'Specific files to stage (empty = all)',
          items: { type: 'string' },
        },
      },
      required: ['message'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const files = args.files as string[] | undefined;
        if (files && files.length > 0) {
          await gitExec(['add', ...files], context.workingDir);
        } else {
          await gitExec(['add', '-A'], context.workingDir);
        }
        const { stdout } = await gitExec(['commit', '-m', args.message as string], context.workingDir);
        return { success: true, output: stdout };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitBranchTool(): Tool {
  return {
    name: 'git_branch',
    description: 'List, create, or switch git branches',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: list, create, switch', enum: ['list', 'create', 'switch'] },
        name: { type: 'string', description: 'Branch name (for create/switch)' },
      },
      required: ['action'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const action = args.action as string;
        let result: string;
        switch (action) {
          case 'list': {
            const { stdout } = await gitExec(['branch', '-a'], context.workingDir);
            result = stdout;
            break;
          }
          case 'create': {
            if (!args.name) return { success: false, output: null, error: 'Branch name required' };
            const { stdout } = await gitExec(['branch', args.name as string], context.workingDir);
            result = stdout || `Branch "${args.name}" created`;
            break;
          }
          case 'switch': {
            if (!args.name) return { success: false, output: null, error: 'Branch name required' };
            const { stdout } = await gitExec(['checkout', args.name as string], context.workingDir);
            result = stdout || `Switched to "${args.name}"`;
            break;
          }
          default:
            return { success: false, output: null, error: `Unknown action: ${action}` };
        }
        return { success: true, output: result };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitPushTool(): Tool {
  return {
    name: 'git_push',
    description: 'Push commits to remote',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch name (default: current)' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const remote = (args.remote as string) || 'origin';
        const branch = args.branch as string | undefined;
        const cmdArgs = ['push', remote];
        if (branch) cmdArgs.push(branch);
        const { stdout, stderr } = await gitExec(cmdArgs, context.workingDir, 30000);
        return { success: true, output: stdout || stderr };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createGitPullTool(): Tool {
  return {
    name: 'git_pull',
    description: 'Pull commits from remote',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name (default: origin)' },
        branch: { type: 'string', description: 'Branch name' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const remote = (args.remote as string) || 'origin';
        const branch = args.branch as string | undefined;
        const cmdArgs = ['pull', remote];
        if (branch) cmdArgs.push(branch);
        const { stdout, stderr } = await gitExec(cmdArgs, context.workingDir, 30000);
        return { success: true, output: stdout || stderr };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

registerTool(createGitStatusTool());
registerTool(createGitDiffTool());
registerTool(createGitLogTool());
registerTool(createGitCommitTool());
registerTool(createGitBranchTool());
registerTool(createGitPushTool());
registerTool(createGitPullTool());
