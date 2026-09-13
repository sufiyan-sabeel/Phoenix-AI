import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

const execAsync = promisify(exec);

async function adbExec(args: string[], timeout = 30000): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execAsync(`adb ${args.join(' ')}`, { timeout, maxBuffer: 10 * 1024 * 1024 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function requirePermission(context: ToolContext, permission: string): ToolResult | null {
  if (!context.permissions.includes('*') && !context.permissions.includes(permission)) {
    return { success: false, output: null, error: `Permission denied: ${permission} required` };
  }
  return null;
}

function createAdbDevicesTool(): Tool {
  return {
    name: 'adb_devices',
    description: 'List connected ADB devices with their states',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        serial: { type: 'string', description: 'Specific device serial (optional)' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:devices');
      if (permCheck) return permCheck;

      try {
        const { stdout } = await adbExec(['devices', '-l']);
        const lines = stdout.split('\n').slice(1).filter(Boolean);
        const devices = lines.map(line => {
          const parts = line.split(/\s+/);
          const serial = parts[0];
          const state = parts[1] || 'unknown';
          const model = parts.find(p => p.startsWith('model:'))?.split(':')[1] || 'unknown';
          return { serial, state, model };
        });

        if (args.serial) {
          const device = devices.find(d => d.serial === args.serial);
          if (!device) {
            return { success: false, output: null, error: `Device "${args.serial}" not found` };
          }
          return { success: true, output: device };
        }

        return { success: true, output: devices };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbShellTool(): Tool {
  return {
    name: 'adb_shell',
    description: 'Execute a shell command on an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        serial: { type: 'string', description: 'Device serial (for multi-device)' },
      },
      required: ['command'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:shell');
      if (permCheck) return permCheck;

      try {
        const cmdArgs = ['shell', args.command as string];
        if (args.serial) cmdArgs.unshift('-s', args.serial as string);
        const { stdout, stderr } = await adbExec(cmdArgs);
        return { success: true, output: { stdout, stderr } };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbPushTool(): Tool {
  return {
    name: 'adb_push',
    description: 'Push a file to an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: 'Local file path' },
        remotePath: { type: 'string', description: 'Destination path on device' },
        serial: { type: 'string', description: 'Device serial' },
      },
      required: ['localPath', 'remotePath'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:push');
      if (permCheck) return permCheck;

      try {
        const cmdArgs = ['push', args.localPath as string, args.remotePath as string];
        if (args.serial) cmdArgs.unshift('-s', args.serial as string);
        const { stdout } = await adbExec(cmdArgs, 60000);
        return { success: true, output: stdout };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbPullTool(): Tool {
  return {
    name: 'adb_pull',
    description: 'Pull a file from an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        remotePath: { type: 'string', description: 'File path on device' },
        localPath: { type: 'string', description: 'Local destination path' },
        serial: { type: 'string', description: 'Device serial' },
      },
      required: ['remotePath', 'localPath'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:pull');
      if (permCheck) return permCheck;

      try {
        const cmdArgs = ['pull', args.remotePath as string, args.localPath as string];
        if (args.serial) cmdArgs.unshift('-s', args.serial as string);
        const { stdout } = await adbExec(cmdArgs, 60000);
        return { success: true, output: stdout };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbInstallTool(): Tool {
  return {
    name: 'adb_install',
    description: 'Install an APK on an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        apkPath: { type: 'string', description: 'Path to the APK file' },
        serial: { type: 'string', description: 'Device serial' },
        reinstall: { type: 'boolean', description: 'Reinstall existing app' },
      },
      required: ['apkPath'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:install');
      if (permCheck) return permCheck;

      try {
        const cmdArgs = ['install'];
        if (args.reinstall) cmdArgs.push('-r');
        cmdArgs.push(args.apkPath as string);
        if (args.serial) cmdArgs.unshift('-s', args.serial as string);
        const { stdout, stderr } = await adbExec(cmdArgs, 120000);
        const output = stdout || stderr;
        const success = output.includes('Success');
        return { success, output, error: success ? undefined : 'Install may have failed' };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbUninstallTool(): Tool {
  return {
    name: 'adb_uninstall',
    description: 'Uninstall an app from an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        packageName: { type: 'string', description: 'Package name to uninstall' },
        serial: { type: 'string', description: 'Device serial' },
      },
      required: ['packageName'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:uninstall');
      if (permCheck) return permCheck;

      try {
        const cmdArgs = ['uninstall', args.packageName as string];
        if (args.serial) cmdArgs.unshift('-s', args.serial as string);
        const { stdout, stderr } = await adbExec(cmdArgs);
        const output = stdout || stderr;
        const success = output.includes('Success');
        return { success, output, error: success ? undefined : output };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbScreenshotTool(): Tool {
  return {
    name: 'adb_screenshot',
    description: 'Capture a screenshot from an Android device',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: 'Where to save the screenshot' },
        serial: { type: 'string', description: 'Device serial' },
      },
      required: ['localPath'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:screenshot');
      if (permCheck) return permCheck;

      try {
        const remotePath = '/sdcard/phoenix_screenshot.png';
        const cmdArgs: string[] = [];
        if (args.serial) cmdArgs.push('-s', args.serial as string);

        await adbExec([...cmdArgs, 'shell', 'screencap', '-p', remotePath]);
        await adbExec([...cmdArgs, 'pull', remotePath, args.localPath as string]);
        await adbExec([...cmdArgs, 'shell', 'rm', remotePath]);

        return { success: true, output: { savedTo: args.localPath } };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createAdbLogcatTool(): Tool {
  return {
    name: 'adb_logcat',
    description: 'Read device logs',
    category: 'adb',
    parameters: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: 'Number of lines to read (default: 100)' },
        filter: { type: 'string', description: 'Log filter (e.g., "MyApp:V *:S")' },
        serial: { type: 'string', description: 'Device serial' },
      },
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const permCheck = requirePermission(context, 'adb:logcat');
      if (permCheck) return permCheck;

      try {
        const count = (args.lines as number) || 100;
        const cmdArgs: string[] = [];
        if (args.serial) cmdArgs.push('-s', args.serial as string);

        let logcatArgs = ['logcat', '-d', '-t', String(count)];
        if (args.filter) {
          logcatArgs.push(args.filter as string);
        } else {
          logcatArgs.push('*:W');
        }

        const { stdout } = await adbExec([...cmdArgs, ...logcatArgs]);
        const logs = stdout.split('\n').filter(Boolean).map(line => {
          const match = line.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s(.*)$/);
          if (match) {
            return { date: match[1], pid: match[2], tid: match[3], level: match[4], tag: match[5], message: match[6] };
          }
          return { raw: line };
        });
        return { success: true, output: logs };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

registerTool(createAdbDevicesTool());
registerTool(createAdbShellTool());
registerTool(createAdbPushTool());
registerTool(createAdbPullTool());
registerTool(createAdbInstallTool());
registerTool(createAdbUninstallTool());
registerTool(createAdbScreenshotTool());
registerTool(createAdbLogcatTool());
