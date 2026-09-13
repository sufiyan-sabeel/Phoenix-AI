import { useState, useRef, useEffect } from 'react';
import { type TerminalLine } from '../lib/api';
import { Copy, Trash2, ChevronDown } from 'lucide-react';

interface TerminalPaneProps {
  lines: TerminalLine[];
  onClear: () => void;
}

export default function TerminalPane({ lines, onClear }: TerminalPaneProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCopy = async () => {
    const text = lines.map((l) => l.content).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-main">
        <div className="flex items-center gap-2">
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Terminal</span>
          <span className="text-xs text-text-muted font-code">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted hover:text-text-secondary"
            title="Copy output"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted hover:text-text-secondary"
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 terminal-bg font-code text-xs"
      >
        {lines.length === 0 ? (
          <div className="text-text-muted italic">No terminal output</div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`whitespace-pre-wrap break-all ${
                line.type === 'stderr'
                  ? 'text-error'
                  : line.type === 'system'
                    ? 'text-tertiary'
                    : 'text-text-secondary'
              }`}
            >
              <span className="text-text-muted select-none mr-2 inline-block w-16 text-right">
                {new Date(line.timestamp).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              {line.content}
            </div>
          ))
        )}
      </div>

      {copied && (
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-success text-obsidian text-xs rounded animate-fade-in">
          Copied!
        </div>
      )}
    </div>
  );
}
