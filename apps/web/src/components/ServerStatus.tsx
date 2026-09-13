import { useState, useEffect, useCallback } from 'react';
import { fetchServerInfo, type ServerInfo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Wifi, WifiOff, Clock } from 'lucide-react';

interface ServerStatusProps {
  compact?: boolean;
}

export default function ServerStatus({ compact = false }: ServerStatusProps) {
  const { serverUrl } = useAuth();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastPing, setLastPing] = useState<number>(0);
  const [showTooltip, setShowTooltip] = useState(false);

  const ping = useCallback(async () => {
    const start = Date.now();
    try {
      const res = await fetchServerInfo();
      const end = Date.now();
      setLatency(end - start);
      setLastPing(end);
      if (res.ok && res.data) {
        setInfo(res.data);
      }
    } catch {
      setLatency(null);
    }
  }, []);

  useEffect(() => {
    ping();
    const interval = setInterval(ping, 15000);
    return () => clearInterval(interval);
  }, [ping]);

  const statusColor = !info
    ? 'bg-error'
    : info.status === 'online'
      ? 'bg-success'
      : info.status === 'degraded'
        ? 'bg-warning'
        : 'bg-error';

  const statusLabel = !info
    ? 'Disconnected'
    : info.status === 'online'
      ? 'Online'
      : info.status === 'degraded'
        ? 'Degraded'
        : 'Offline';

  if (compact) {
    return (
      <div className="relative flex items-center gap-2">
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-1 border border-border-main hover:border-border-highlight transition-colors"
        >
          <div className={`w-2 h-2 rounded-full ${statusColor} ${info?.status === 'online' ? 'animate-pulse-ember' : ''}`} />
          {latency !== null && (
            <span className="text-xs font-code text-text-secondary">{latency}ms</span>
          )}
        </button>

        {showTooltip && (
          <div className="absolute top-full mt-2 right-0 z-50 surface-elevated p-3 min-w-[200px] animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              {info ? (
                <Wifi className="w-4 h-4 text-success" />
              ) : (
                <WifiOff className="w-4 h-4 text-error" />
              )}
              <span className="text-sm font-medium text-text-primary">{statusLabel}</span>
            </div>
            <div className="space-y-1 text-xs text-text-secondary">
              <div className="flex justify-between">
                <span>Latency</span>
                <span className="font-code">{latency !== null ? `${latency}ms` : '—'}</span>
              </div>
              {info && (
                <>
                  <div className="flex justify-between">
                    <span>Version</span>
                    <span className="font-code">{info.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Uptime</span>
                    <span className="font-code">{Math.floor(info.uptime / 3600)}h</span>
                  </div>
                </>
              )}
              {lastPing > 0 && (
                <div className="flex justify-between">
                  <span>Last ping</span>
                  <span className="font-code flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(lastPing).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 surface-panel">
      <div className={`w-2.5 h-2.5 rounded-full ${statusColor} ${info?.status === 'online' ? 'animate-pulse-ember' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{statusLabel}</div>
        <div className="text-xs text-text-secondary">
          {latency !== null ? `${latency}ms latency` : 'Checking...'}
        </div>
      </div>
      {info && (
        <div className="text-xs text-text-muted font-code">v{info.version}</div>
      )}
    </div>
  );
}
