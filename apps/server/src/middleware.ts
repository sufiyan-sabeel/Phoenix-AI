import type { Request, Response, NextFunction } from 'express';
import type { StreamEvent } from '@phoenix/shared';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const hits = new Map<string, RateLimitEntry>();

function cleanupStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key);
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logFn(`[${new Date().toISOString()}] ${method} ${url} ${status} ${duration}ms`);
  });

  next();
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const status = (err as any).status ?? (err as any).statusCode ?? 500;
  const message = err.message || 'Internal server error';

  console.error(`[error] ${message}`);
  if (process.env['NODE_ENV'] !== 'production' && err.stack) {
    console.error(err.stack);
  }

  res.status(status).json({
    error: 'Error',
    message,
    ...(process.env['NODE_ENV'] !== 'production' ? { stack: err.stack } : {}),
  });
}

export function rateLimit(opts: { windowMs: number; max: number; keyFn?: (req: Request) => string }) {
  const { windowMs, max, keyFn } = opts;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : (req.ip ?? req.socket.remoteAddress ?? 'unknown');

    cleanupStaleEntries();

    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetAt - now) / 1000)}s`,
      });
      return;
    }

    next();
  };
}

export function validateBody(schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request body',
        details: result.error?.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    next();
  };
}

export function sseHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  next();
}

export async function streamToSSE(
  generator: AsyncGenerator<StreamEvent>,
  res: Response
): Promise<void> {
  try {
    for await (const event of generator) {
      const data = JSON.stringify(event);
      res.write(`data: ${data}\n\n`);
    }
  } catch (err) {
    const errorEvent: StreamEvent = {
      type: 'error',
      data: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      },
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
