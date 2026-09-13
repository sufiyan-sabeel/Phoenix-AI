export interface PhoenixExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  onActivate(ctx: ExtensionContext): void | Promise<void>;
  onDeactivate(): void | Promise<void>;
}

export interface ExtensionContext {
  registerTool(tool: any): void;
  registerCommand(command: any): void;
  registerEvent(event: string, handler: Function): void;
  getAPI(): any;
}

export class ExtensionHost {
  private extensions: Map<string, PhoenixExtension> = new Map();

  async loadExtension(path: string): Promise<void> {
    const mod = await import(path);
    const ext: PhoenixExtension = mod.default ?? mod.greeterExtension ?? mod;
    if (!ext.id || !ext.name) {
      throw new Error(`Invalid extension at ${path}: missing id or name`);
    }
    this.extensions.set(ext.id, ext);
  }

  async activateExtension(id: string, ctx: ExtensionContext): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) {
      throw new Error(`Extension not found: ${id}`);
    }
    await ext.onActivate(ctx);
  }

  async deactivateExtension(id: string): Promise<void> {
    const ext = this.extensions.get(id);
    if (!ext) {
      throw new Error(`Extension not found: ${id}`);
    }
    await ext.onDeactivate();
  }

  listExtensions(): PhoenixExtension[] {
    return Array.from(this.extensions.values());
  }
}
