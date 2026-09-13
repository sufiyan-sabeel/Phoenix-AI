import type { Tool, ToolContext, ToolResult, ToolRegistry as IToolRegistry } from './types.js';

const registry: IToolRegistry = new Map();

export function registerTool(tool: Tool): void {
  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error('Tool must have a valid name');
  }
  if (!tool.description || typeof tool.description !== 'string') {
    throw new Error('Tool must have a valid description');
  }
  if (!tool.category || typeof tool.category !== 'string') {
    throw new Error('Tool must have a valid category');
  }
  if (!tool.parameters || tool.parameters.type !== 'object') {
    throw new Error('Tool must have valid parameters with type "object"');
  }
  if (typeof tool.execute !== 'function') {
    throw new Error('Tool must have an execute function');
  }
  if (registry.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  registry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function listTools(category?: string): Tool[] {
  const tools = Array.from(registry.values());
  if (category) {
    return tools.filter(t => t.category === category);
  }
  return tools;
}

export function listByCategory(): Record<string, Tool[]> {
  const grouped: Record<string, Tool[]> = {};
  for (const tool of registry.values()) {
    if (!grouped[tool.category]) {
      grouped[tool.category] = [];
    }
    grouped[tool.category].push(tool);
  }
  return grouped;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { success: false, output: null, error: `Tool "${name}" not found` };
  }

  const permissionKey = `${tool.category}:${tool.name}`;
  const hasPermission =
    context.permissions.includes('*') ||
    context.permissions.includes(permissionKey) ||
    context.permissions.includes(`${tool.category}:*`);

  if (!hasPermission) {
    return {
      success: false,
      output: null,
      error: `Permission denied for tool "${name}". Required: ${permissionKey}`,
    };
  }

  try {
    const result = await tool.execute(args, context);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: null, error: `Tool execution failed: ${message}` };
  }
}
