import type { Trigger, WebhookConfig, ScheduleConfig, CommandConfig } from './types.js';

export type TriggerHandler = (data: Record<string, unknown>) => void | Promise<void>;

export interface WebhookRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body?: unknown;
}

export class WebhookHandler {
  private handlers = new Map<string, TriggerHandler>();
  private secrets = new Map<string, string>();

  register(config: WebhookConfig, handler: TriggerHandler): void {
    this.handlers.set(config.path, handler);
    if (config.secret) {
      this.secrets.set(config.path, config.secret);
    }
  }

  unregister(path: string): void {
    this.handlers.delete(path);
    this.secrets.delete(path);
  }

  async handle(request: WebhookRequest): Promise<WebhookResponse> {
    const handler = this.handlers.get(request.path);
    if (!handler) {
      return { status: 404, body: { error: 'Webhook not found' } };
    }

    const secret = this.secrets.get(request.path);
    if (secret) {
      const providedSecret = request.headers['x-webhook-secret'] ?? request.headers['authorization'];
      if (providedSecret !== secret) {
        return { status: 401, body: { error: 'Unauthorized' } };
      }
    }

    try {
      const data = {
        method: request.method,
        headers: request.headers,
        body: request.body,
        query: request.query,
        timestamp: Date.now(),
      };

      await handler(data);
      return { status: 200, body: { success: true } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 500, body: { error: message } };
    }
  }

  getRegisteredPaths(): string[] {
    return Array.from(this.handlers.keys());
  }

  createMiddleware() {
    return async (req: { method: string; path: string; headers: Record<string, string>; body?: unknown; query?: Record<string, string> }, res: { status: (code: number) => { json: (body: unknown) => void } }): Promise<void> => {
      const result = await this.handle({
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        query: req.query,
      });

      res.status(result.status).json(result.body);
    };
  }
}

export class ScheduleHandler {
  private schedules = new Map<string, { config: ScheduleConfig; handler: TriggerHandler; intervalId?: ReturnType<typeof setInterval> }>();

  register(id: string, config: ScheduleConfig, handler: TriggerHandler): void {
    this.schedules.set(id, { config, handler });
  }

  unregister(id: string): void {
    const schedule = this.schedules.get(id);
    if (schedule?.intervalId) {
      clearInterval(schedule.intervalId);
    }
    this.schedules.delete(id);
  }

  start(id: string): void {
    const schedule = this.schedules.get(id);
    if (!schedule) return;
    if (schedule.intervalId) return;

    schedule.intervalId = setInterval(async () => {
      try {
        await schedule.handler({ scheduleId: id, timestamp: Date.now() });
      } catch (error) {
        console.error(`Schedule ${id} execution error:`, error);
      }
    }, schedule.config.interval);
  }

  stop(id: string): void {
    const schedule = this.schedules.get(id);
    if (schedule?.intervalId) {
      clearInterval(schedule.intervalId);
      schedule.intervalId = undefined;
    }
  }

  startAll(): void {
    for (const id of this.schedules.keys()) {
      this.start(id);
    }
  }

  stopAll(): void {
    for (const [id] of this.schedules) {
      this.stop(id);
    }
  }

  getSchedule(id: string): { config: ScheduleConfig; running: boolean } | undefined {
    const schedule = this.schedules.get(id);
    if (!schedule) return undefined;
    return {
      config: schedule.config,
      running: schedule.intervalId !== undefined,
    };
  }
}

export class CommandHandler {
  private commands = new Map<string, { config: CommandConfig; handler: TriggerHandler }>();

  register(config: CommandConfig, handler: TriggerHandler): void {
    this.commands.set(config.command, { config, handler });
  }

  unregister(command: string): void {
    this.commands.delete(command);
  }

  async execute(command: string, args: Record<string, unknown> = {}): Promise<void> {
    const registered = this.commands.get(command);
    if (!registered) {
      throw new Error(`Unknown command: ${command}`);
    }

    await registered.handler({
      command,
      args,
      timestamp: Date.now(),
    });
  }

  listCommands(): Array<{ command: string; description?: string }> {
    return Array.from(this.commands.values()).map(({ config }) => ({
      command: config.command,
      description: config.description,
    }));
  }

  hasCommand(command: string): boolean {
    return this.commands.has(command);
  }
}