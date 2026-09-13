import { useState, useCallback, useEffect, useRef } from 'react';
import { connectWebSocket, type WSMessage } from '../lib/api';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface UseWebSocketOptions {
  onMessage?: (msg: WSMessage) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const pingTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    setConnectionState('connecting');

    const ws = connectWebSocket(
      (msg) => {
        if (msg.type === 'pong') {
          setLatency(Date.now() - pingTimeRef.current);
          return;
        }
        onMessage?.(msg);
      },
      () => {
        setConnectionState('connected');
        reconnectCount.current = 0;

        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      },
      () => {
        setConnectionState('disconnected');
        cleanup();

        if (autoReconnect && reconnectCount.current < maxReconnectAttempts) {
          setConnectionState('reconnecting');
          reconnectCount.current += 1;
          setTimeout(connect, reconnectInterval);
        }
      },
      () => {
        setConnectionState('disconnected');
      },
    );

    wsRef.current = ws;
  }, [cleanup, onMessage, autoReconnect, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    reconnectCount.current = maxReconnectAttempts;
    cleanup();
    setConnectionState('disconnected');
  }, [cleanup, maxReconnectAttempts]);

  const send = useCallback((msg: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    connectionState,
    latency,
    connect,
    disconnect,
    send,
  };
}
