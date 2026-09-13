import { useState, useEffect, useCallback } from 'react';
import { fetchConnectors, updateConnector, type McpConnector } from '../lib/api';
import { X, Plug, ToggleLeft, ToggleRight, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'connectors' | 'telegram' | 'voice' | 'automation'>('connectors');

  const loadConnectors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchConnectors();
      if (res.ok && res.data) {
        setConnectors(res.data);
      } else {
        setError(res.error || 'Failed to load connectors');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const handleToggle = async (connector: McpConnector) => {
    try {
      const newStatus = connector.status === 'connected' ? 'disconnected' : 'connected';
      const res = await updateConnector(connector.id, {
        ...connector.config,
        enabled: newStatus === 'connected',
      });
      if (res.ok && res.data) {
        setConnectors((prev) =>
          prev.map((c) => (c.id === connector.id ? res.data! : c)),
        );
      }
    } catch {
      // error handled by UI
    }
  };

  const tabs = [
    { id: 'connectors' as const, label: 'MCP Connectors' },
    { id: 'telegram' as const, label: 'Telegram' },
    { id: 'voice' as const, label: 'Voice' },
    { id: 'automation' as const, label: 'Automation' },
  ];

  return (
    <div className="w-80 flex flex-col border-l border-border-main bg-graphite h-full">
      <div className="flex items-center justify-between p-3 border-b border-border-main">
        <span className="text-sm font-medium text-text-primary font-headline">Settings</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 p-2 border-b border-border-main overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-ember/15 text-ember border border-ember/25'
                : 'text-text-secondary hover:bg-surface-1 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'connectors' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted uppercase tracking-wider">MCP Connectors</span>
              <button
                onClick={loadConnectors}
                className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {error && (
              <div className="p-2 text-sm text-error bg-error/10 rounded border border-error/25">
                {error}
              </div>
            )}

            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="p-3 surface-panel rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Plug className="w-4 h-4 text-ember" />
                    <span className="text-sm font-medium text-text-primary">{connector.name}</span>
                  </div>
                  <button
                    onClick={() => handleToggle(connector)}
                    className="transition-colors"
                  >
                    {connector.status === 'connected' ? (
                      <ToggleRight className="w-6 h-6 text-success" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-text-muted" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {connector.status === 'connected' ? (
                    <Wifi className="w-3 h-3 text-success" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-text-muted" />
                  )}
                  <span className="text-text-secondary capitalize">{connector.status}</span>
                  <span className="text-text-muted">•</span>
                  <span className="text-text-muted">{connector.type}</span>
                </div>
              </div>
            ))}

            {!isLoading && connectors.length === 0 && (
              <div className="py-8 text-center text-sm text-text-muted">
                No connectors configured
              </div>
            )}
          </div>
        )}

        {activeTab === 'telegram' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted uppercase tracking-wider">Telegram Bot</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Bot Token</label>
                <input
                  type="password"
                  placeholder="Enter bot token..."
                  className="w-full px-3 py-2 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Chat ID</label>
                <input
                  type="text"
                  placeholder="Enter chat ID..."
                  className="w-full px-3 py-2 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50 transition-colors"
                />
              </div>
              <button className="w-full py-2 rounded-lg bg-ember text-obsidian font-medium text-sm hover:bg-ember-light transition-colors">
                Save Telegram Settings
              </button>
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted uppercase tracking-wider">Voice Settings</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">TTS Provider</label>
                <select className="w-full px-3 py-2 rounded bg-surface-1 border border-border-main text-sm text-text-primary outline-none focus:border-ember/50 transition-colors">
                  <option>OpenAI TTS</option>
                  <option>ElevenLabs</option>
                  <option>Browser TTS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Voice</label>
                <select className="w-full px-3 py-2 rounded bg-surface-1 border border-border-main text-sm text-text-primary outline-none focus:border-ember/50 transition-colors">
                  <option>Alloy</option>
                  <option>Echo</option>
                  <option>Fable</option>
                  <option>Onyx</option>
                  <option>Nova</option>
                  <option>Shimmer</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Speed</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  defaultValue="1"
                  className="w-full accent-ember"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'automation' && (
          <div className="space-y-4">
            <div className="text-xs text-text-muted uppercase tracking-wider">Workflows</div>
            <div className="space-y-3">
              <div className="p-3 surface-panel rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary">Auto-summarize</span>
                  <ToggleRight className="w-6 h-6 text-success" />
                </div>
                <p className="text-xs text-text-secondary">Automatically summarize long conversations</p>
              </div>
              <div className="p-3 surface-panel rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary">Memory persistence</span>
                  <ToggleRight className="w-6 h-6 text-success" />
                </div>
                <p className="text-xs text-text-secondary">Save important facts to memory layers</p>
              </div>
              <div className="p-3 surface-panel rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-text-primary">Tool auto-approval</span>
                  <ToggleLeft className="w-6 h-6 text-text-muted" />
                </div>
                <p className="text-xs text-text-secondary">Automatically approve safe tool calls</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
