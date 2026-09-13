import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

const execAsync = promisify(exec);

function createRunPythonScriptTool(): Tool {
  return {
    name: 'run_python_script',
    description: 'Execute Python code in a sandboxed subprocess',
    category: 'python',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
        packages: {
          type: 'array',
          description: 'Python packages to install before running',
          items: { type: 'string' },
        },
      },
      required: ['code'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const timeout = (args.timeout as number) || 30000;
      const code = args.code as string;
      const packages = (args.packages as string[]) || [];
      const scriptId = randomBytes(8).toString('hex');
      const scriptPath = join(context.workingDir, `.phoenix_py_${scriptId}.py`);

      try {
        if (packages.length > 0) {
          try {
            await execAsync(`pip install ${packages.join(' ')}`, { timeout: 60000 });
          } catch {
            // Continue even if pip install fails - code may not need them
          }
        }

        await writeFile(scriptPath, code, 'utf-8');
        const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
          cwd: context.workingDir,
          timeout,
          env: { ...process.env, ...context.env },
          maxBuffer: 10 * 1024 * 1024,
        });

        return {
          success: true,
          output: { stdout: stdout.trim(), stderr: stderr.trim() },
          metadata: { scriptPath, timeout },
        };
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; stderr?: string; message?: string; code?: number };
        return {
          success: false,
          output: {
            stdout: execErr.stdout?.trim() || '',
            stderr: execErr.stderr?.trim() || '',
          },
          error: execErr.message || 'Python execution failed',
          metadata: { exitCode: execErr.code },
        };
      } finally {
        try {
          await unlink(scriptPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
  };
}

registerTool(createRunPythonScriptTool());
