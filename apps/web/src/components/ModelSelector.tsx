import { useState, useRef, useEffect } from 'react';
import { type ModelInfo } from '../lib/api';
import { ChevronDown, Cpu, Check } from 'lucide-react';

interface ModelSelectorProps {
  models: ModelInfo[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}

export default function ModelSelector({ models, selectedModel, onSelect, disabled }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-1 border border-border-main hover:border-border-highlight transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        <Cpu className="w-3.5 h-3.5 text-ember" />
        <span className="text-text-primary truncate max-w-[160px]">
          {currentModel?.name || selectedModel || 'Select model'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 surface-elevated py-1 animate-fade-in">
          {Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                {provider}
              </div>
              {providerModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  disabled={!model.available}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    model.available
                      ? 'hover:bg-surface-2 text-text-primary'
                      : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  <span className="flex-1 text-left truncate">{model.name}</span>
                  {!model.available && (
                    <span className="text-xs text-text-muted">Unavailable</span>
                  )}
                  {model.id === selectedModel && (
                    <Check className="w-4 h-4 text-ember" />
                  )}
                </button>
              ))}
            </div>
          ))}
          {models.length === 0 && (
            <div className="px-3 py-4 text-sm text-text-muted text-center">
              No models available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
