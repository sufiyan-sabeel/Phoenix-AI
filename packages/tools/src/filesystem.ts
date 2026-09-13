import { readdir, readFile, writeFile, unlink, stat, access } from 'fs/promises';
import { join, resolve, relative, isAbsolute } from 'path';
import { glob } from 'fs/promises';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { registerTool } from './registry.js';

function safePath(workingDir: string, filePath: string): string {
  const target = isAbsolute(filePath) ? resolve(filePath) : resolve(workingDir, filePath);
  const rel = relative(workingDir, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal detected: ${filePath} resolves outside working directory`);
  }
  return target;
}

function createListDirectoryTool(): Tool {
  return {
    name: 'list_directory',
    description: 'List contents of a directory',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (relative to working dir)' },
        recursive: { type: 'boolean', description: 'List recursively' },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const target = safePath(context.workingDir, args.path as string);
        const entries = await readdir(target, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          path: join(args.path as string, e.name),
        }));
        return { success: true, output: items };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createReadFileTool(): Tool {
  return {
    name: 'read_file',
    description: 'Read the contents of a file',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (relative to working dir)' },
        encoding: { type: 'string', description: 'File encoding (default: utf-8)' },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const target = safePath(context.workingDir, args.path as string);
        const encoding = (args.encoding as BufferEncoding) || 'utf-8';
        const content = await readFile(target, { encoding });
        const fileStat = await stat(target);
        return {
          success: true,
          output: { content, size: fileStat.size, modified: fileStat.mtime },
        };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createWriteFileTool(): Tool {
  return {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (relative to working dir)' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const target = safePath(context.workingDir, args.path as string);
        await writeFile(target, args.content as string, 'utf-8');
        return { success: true, output: { path: args.path, bytesWritten: (args.content as string).length } };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createDeleteFileTool(): Tool {
  return {
    name: 'delete_file',
    description: 'Delete a file',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete (relative to working dir)' },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const target = safePath(context.workingDir, args.path as string);
        await unlink(target);
        return { success: true, output: { deleted: args.path } };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createSearchFilesTool(): Tool {
  return {
    name: 'search_files',
    description: 'Search for files matching a glob pattern',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' },
        path: { type: 'string', description: 'Directory to search in (default: working dir)' },
      },
      required: ['pattern'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const searchDir = args.path
          ? safePath(context.workingDir, args.path as string)
          : context.workingDir;
        const matches: string[] = [];
        for await (const entry of glob(args.pattern as string, { cwd: searchDir })) {
          matches.push(entry);
          if (matches.length >= 1000) break;
        }
        return { success: true, output: matches };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

function createSearchContentTool(): Tool {
  return {
    name: 'search_content',
    description: 'Search file contents for a pattern (grep-like)',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        path: { type: 'string', description: 'Directory or file to search in' },
        include: { type: 'string', description: 'File pattern to include (e.g., "*.ts")' },
      },
      required: ['pattern', 'path'],
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      try {
        const searchPath = safePath(context.workingDir, args.path as string);
        const fileStat = await stat(searchPath);
        const isFile = fileStat.isFile();
        const regex = new RegExp(args.pattern as string, 'gi');
        const results: Array<{ file: string; line: number; content: string }> = [];

        const filesToSearch: string[] = [];
        if (isFile) {
          filesToSearch.push(searchPath);
        } else {
          const pattern = args.include ? `**/${args.include}` : '**/*';
          for await (const entry of glob(pattern, { cwd: searchPath })) {
            filesToSearch.push(join(searchPath, entry));
            if (filesToSearch.length >= 500) break;
          }
        }

        for (const filePath of filesToSearch) {
          try {
            const content = await readFile(filePath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  file: relative(context.workingDir, filePath),
                  line: i + 1,
                  content: lines[i].trim(),
                });
              }
              regex.lastIndex = 0;
            }
          } catch {
            continue;
          }
          if (results.length >= 500) break;
        }

        return { success: true, output: results };
      } catch (err) {
        return { success: false, output: null, error: (err as Error).message };
      }
    },
  };
}

registerTool(createListDirectoryTool());
registerTool(createReadFileTool());
registerTool(createWriteFileTool());
registerTool(createDeleteFileTool());
registerTool(createSearchFilesTool());
registerTool(createSearchContentTool());
