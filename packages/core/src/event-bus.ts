import type { PhoenixEvent } from '@phoenix/shared';

type EventHandler<T = any> = (data: T) => void | Promise<void>;

interface EventEntry {
  handlers: Set<EventHandler>;
}

export class EventBus {
  private events = new Map<string, EventEntry>();
  private wildcardHandlers = new Set<EventHandler<PhoenixEvent>>();
  private errorHandler?: (error: Error, event: PhoenixEvent) => void;

  constructor(errorHandler?: (error: Error, event: PhoenixEvent) => void) {
    this.errorHandler = errorHandler;
  }

  on<K extends PhoenixEvent['type']>(
    event: K,
    handler: EventHandler<Extract<PhoenixEvent, { type: K }>['data']>
  ): () => void {
    if (event === '*') {
      this.wildcardHandlers.add(handler as EventHandler<PhoenixEvent>);
      return () => {
        this.wildcardHandlers.delete(handler as EventHandler<PhoenixEvent>);
      };
    }

    let entry = this.events.get(event);
    if (!entry) {
      entry = { handlers: new Set() };
      this.events.set(event, entry);
    }
    entry.handlers.add(handler as EventHandler);

    return () => {
      entry!.handlers.delete(handler as EventHandler);
    };
  }

  off<K extends PhoenixEvent['type']>(
    event: K,
    handler: EventHandler<Extract<PhoenixEvent, { type: K }>['data']>
  ): void {
    if (event === '*') {
      this.wildcardHandlers.delete(handler as EventHandler<PhoenixEvent>);
      return;
    }

    const entry = this.events.get(event);
    if (entry) {
      entry.handlers.delete(handler as EventHandler);
      if (entry.handlers.size === 0) {
        this.events.delete(event);
      }
    }
  }

  async emit<T extends PhoenixEvent>(event: T): Promise<void> {
    const entry = this.events.get(event.type);
    const handlers = entry ? [...entry.handlers] : [];
    const wildcards = [...this.wildcardHandlers];

    const allHandlers = [...handlers, ...wildcards];

    const errors: Error[] = [];

    for (const handler of allHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          await result;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
        if (this.errorHandler) {
          try {
            this.errorHandler(error, event);
          } catch {
            // Swallow error handler failures
          }
        }
      }
    }

    if (errors.length > 0 && !this.errorHandler) {
      const combined = new Error(
        `Event '${event.type}' had ${errors.length} handler error(s): ${errors.map(e => e.message).join('; ')}`
      );
      combined.stack = errors.map(e => e.stack).join('\n---\n');
      throw combined;
    }
  }

  listenerCount(event: string): number {
    let count = 0;
    if (event === '*') {
      return this.wildcardHandlers.size;
    }
    const entry = this.events.get(event);
    if (entry) {
      count += entry.handlers.size;
    }
    count += this.wildcardHandlers.size;
    return count;
  }

  removeAllListeners(event?: string): void {
    if (event) {
      if (event === '*') {
        this.wildcardHandlers.clear();
      } else {
        this.events.delete(event);
      }
    } else {
      this.events.clear();
      this.wildcardHandlers.clear();
    }
  }

  eventNames(): string[] {
    return [...this.events.keys()];
  }
}
