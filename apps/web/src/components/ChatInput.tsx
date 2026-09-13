import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Send, Paperclip, Mic, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Message PHOENIX...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSend = useCallback(() => {
    if (!value.trim() || disabled || isStreaming) return;
    onSend(value);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, isStreaming, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative surface-panel p-3">
      <div className="flex items-end gap-2">
        <button
          className="flex-shrink-0 p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title="Attach file"
          disabled={disabled || isStreaming}
        >
          <Paperclip className="w-4 h-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-text-primary text-sm placeholder:text-text-muted resize-none outline-none disabled:opacity-50 py-2 max-h-[200px]"
        />

        <button
          className="flex-shrink-0 p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title="Voice input"
          disabled={disabled || isStreaming}
        >
          <Mic className="w-4 h-4" />
        </button>

        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex-shrink-0 p-2 rounded-lg bg-error/20 text-error hover:bg-error/30 transition-colors"
            title="Stop generating"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={`flex-shrink-0 p-2 rounded-lg transition-all ${
              value.trim() && !disabled
                ? 'bg-ember text-obsidian hover:bg-ember-light shadow-ember-glow'
                : 'bg-surface-2 text-text-muted cursor-not-allowed'
            }`}
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-xs text-text-muted">
          <kbd className="px-1 py-0.5 bg-surface-2 rounded text-text-muted font-code">Enter</kbd> to send,{' '}
          <kbd className="px-1 py-0.5 bg-surface-2 rounded text-text-muted font-code">Shift+Enter</kbd> for newline
        </span>
      </div>
    </div>
  );
}
