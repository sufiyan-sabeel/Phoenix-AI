import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { verifyToken } from './auth.js';
import type { Orchestrator } from '@phoenix/core';
import type { StreamEvent } from '@phoenix/shared';

interface WSClient {
  ws: WebSocket;
  userId: string;
  sessionId?: string;
  subscriptions: Set<string>;
  lastPong: number;
}

export function setupWebSocket(server: Server, orchestrator: Orchestrator): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<string, Set<WSClient>>();
  const clientByWs = new WeakMap<WebSocket, WSClient>();

  const HEARTBEAT_INTERVAL = 30000;
  const HEARTBEAT_TIMEOUT = 10000;

  function broadcast(userId: string, message: Record<string, unknown>): void {
    const userClients = clients.get(userId);
    if (!userClients) return;

    const data = JSON.stringify(message);
    for (const client of userClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  function broadcastToSession(sessionId: string, message: Record<string, unknown>): void {
    for (const [, userClients] of clients) {
      for (const client of userClients) {
        if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(message));
        }
      }
    }
  }

  function addClient(client: WSClient): void {
    let userClients = clients.get(client.userId);
    if (!userClients) {
      userClients = new Set();
      clients.set(client.userId, userClients);
    }
    userClients.add(client);
    clientByWs.set(client.ws, client);
  }

  function removeClient(client: WSClient): void {
    const userClients = clients.get(client.userId);
    if (userClients) {
      userClients.delete(client);
      if (userClients.size === 0) {
        clients.delete(client.userId);
      }
    }
    clientByWs.delete(client.ws);
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? '';
    const authHeader = req.headers.authorization;

    let userId: string | null = null;

    if (token) {
      const payload = verifyToken(token);
      if (payload) userId = payload.sub;
    } else if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload) userId = payload.sub;
    }

    if (!userId) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { code: 'AUTH_REQUIRED', message: 'Valid authentication token required' },
      }));
      ws.close(4001, 'Authentication required');
      return;
    }

    const client: WSClient = {
      ws,
      userId,
      subscriptions: new Set(),
      lastPong: Date.now(),
    };
    addClient(client);

    console.log(`[ws] Client connected: userId=${userId}`);

    ws.send(JSON.stringify({
      type: 'connected',
      data: { userId, message: 'Connected to Phoenix server' },
    }));

    ws.on('message', async (raw: Buffer) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString('utf-8'));
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          data: { code: 'INVALID_MESSAGE', message: 'Invalid JSON message' },
        }));
        return;
      }

      const type = msg['type'] as string;

      switch (type) {
        case 'chat': {
          const sessionId = msg['sessionId'] as string;
          const content = msg['content'] as string;

          if (!sessionId || !content) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { code: 'INVALID_PAYLOAD', message: 'sessionId and content are required' },
            }));
            return;
          }

          client.sessionId = sessionId;

          try {
            const generator = orchestrator.processMessage(sessionId, content);

            for await (const event of generator) {
              if (ws.readyState !== WebSocket.OPEN) break;

              ws.send(JSON.stringify({
                type: 'stream_event',
                data: event,
              }));
            }

            ws.send(JSON.stringify({
              type: 'stream_end',
              data: { sessionId },
            }));
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({
              type: 'error',
              data: {
                code: 'STREAM_ERROR',
                message: errorMessage,
                sessionId,
              },
            }));
          }
          break;
        }

        case 'subscribe': {
          const channel = msg['channel'] as string;
          if (channel) {
            client.subscriptions.add(channel);
            ws.send(JSON.stringify({
              type: 'subscribed',
              data: { channel },
            }));
          }
          break;
        }

        case 'unsubscribe': {
          const channel = msg['channel'] as string;
          if (channel) {
            client.subscriptions.delete(channel);
            ws.send(JSON.stringify({
              type: 'unsubscribed',
              data: { channel },
            }));
          }
          break;
        }

        case 'ping': {
          client.lastPong = Date.now();
          ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }));
          break;
        }

        case 'pong': {
          client.lastPong = Date.now();
          break;
        }

        default: {
          ws.send(JSON.stringify({
            type: 'error',
            data: { code: 'UNKNOWN_MESSAGE_TYPE', message: `Unknown message type: ${type}` },
          }));
        }
      }
    });

    ws.on('close', () => {
      removeClient(client);
      console.log(`[ws] Client disconnected: userId=${userId}`);
    });

    ws.on('error', (err) => {
      console.error(`[ws] Client error: userId=${userId}`, err.message);
      removeClient(client);
    });

    ws.on('pong', () => {
      client.lastPong = Date.now();
    });
  });

  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      const client = clientByWs.get(ws);
      if (!client) return;

      if (now - client.lastPong > HEARTBEAT_TIMEOUT) {
        console.log(`[ws] Terminating inactive client: userId=${client.userId}`);
        ws.terminate();
        removeClient(client);
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  (wss as any).__broadcast = broadcast;
  (wss as any).__broadcastToSession = broadcastToSession;

  return wss;
}

export function getBroadcastFn(wss: WebSocketServer) {
  return (wss as any).__broadcast as (userId: string, message: Record<string, unknown>) => void;
}

export function getBroadcastToSessionFn(wss: WebSocketServer) {
  return (wss as any).__broadcastToSession as (sessionId: string, message: Record<string, unknown>) => void;
}
