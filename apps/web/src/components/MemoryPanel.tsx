import { useState, useEffect, useCallback } from 'react';
import { useMemory } from '../hooks/useMemory';
import { X, Plus, Trash2, Edit2, Search, Database, Brain, BookOpen, Zap } from 'lucide-react';

interface MemoryPanelProps {
  onClose: () => void;
}

const LAYER_ICONS: Record<string, React.ReactNode> = {
  core: <Brain className="w-4 h-4" />,
  episodic: <BookOpen className="w-4 h-4" />,
  procedural: <Zap className="w-4 h-4" />,
  semantic: <Database className="w-4 h-4" />,
};

export default function MemoryPanel({ onClose }: MemoryPanelProps) {
  const {
    layers,
    entries,
    isLoading,
    error,
    loadLayers,
    loadEntries,
    addEntry,
    removeEntry,
    search,
  } = useMemory();

  const [activeLayer, setActiveLayer] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadLayers();
  }, [loadLayers]);

  useEffect(() => {
    if (activeLayer) {
      loadEntries(activeLayer);
    }
  }, [activeLayer, loadEntries]);

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim()) {
      await search(searchQuery);
    } else if (activeLayer) {
      await loadEntries(activeLayer);
    }
  }, [searchQuery, activeLayer, search, loadEntries]);

  useEffect(() => {
    const timeout = setTimeout(handleSearch, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  const handleAdd = async () => {
    if (!activeLayer || !newKey.trim() || !newValue.trim()) return;
    try {
      await addEntry(activeLayer, newKey, newValue);
      setNewKey('');
      setNewValue('');
      setIsAdding(false);
    } catch {
      // error handled by hook
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeLayer) return;
    await removeEntry(activeLayer, id);
  };

  return (
    <div className="w-80 flex flex-col border-l border-border-main bg-graphite h-full">
      <div className="flex items-center justify-between p-3 border-b border-border-main">
        <span className="text-sm font-medium text-text-primary font-headline">Memory</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2 border-b border-border-main">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex gap-1 p-2 overflow-x-auto border-b border-border-main">
        {layers.map((layer) => (
          <button
            key={layer.name}
            onClick={() => setActiveLayer(layer.name)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
              activeLayer === layer.name
                ? 'bg-ember/15 text-ember border border-ember/25'
                : 'text-text-secondary hover:bg-surface-1 border border-transparent'
            }`}
          >
            {LAYER_ICONS[layer.name] || <Database className="w-4 h-4" />}
            {layer.name}
            <span className="text-text-muted font-code">{layer.entryCount}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && (
          <div className="py-8 text-center text-sm text-text-muted">Loading...</div>
        )}

        {error && (
          <div className="py-4 px-3 text-sm text-error bg-error/10 rounded-lg border border-error/25">
            {error}
          </div>
        )}

        {!isLoading && !error && entries.length === 0 && activeLayer && (
          <div className="py-8 text-center text-sm text-text-muted">
            No entries in this layer
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-2.5 surface-panel rounded-lg group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-code text-tertiary mb-1">{entry.key}</div>
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full p-2 rounded bg-surface-2 border border-border-highlight text-sm text-text-primary resize-none outline-none"
                      rows={3}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-xs rounded bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-xs rounded bg-ember text-obsidian hover:bg-ember-light transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                    {entry.value}
                  </div>
                )}
              </div>

              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditingId(entry.id);
                    setEditValue(entry.value);
                  }}
                  className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="p-1 rounded hover:bg-error/20 text-text-muted hover:text-error transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeLayer && (
        <div className="p-2 border-t border-border-main">
          {isAdding ? (
            <div className="space-y-2 animate-fade-in">
              <input
                type="text"
                placeholder="Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="w-full px-3 py-1.5 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50"
              />
              <textarea
                placeholder="Value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-1.5 rounded text-sm text-text-secondary bg-surface-2 hover:bg-surface-3 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newKey.trim() || !newValue.trim()}
                  className="flex-1 py-1.5 rounded text-sm font-medium bg-ember text-obsidian hover:bg-ember-light transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border-highlight text-text-muted hover:text-text-secondary hover:border-border-highlight transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Entry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
