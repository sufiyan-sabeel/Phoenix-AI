import { useState } from 'react';
import { type ChatMessage as ChatMessageType, type ToolCall } from '../lib/api';
import { ChevronDown, ChevronRight, User, Bot, Copy, Check } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="px-3 py-1 text-xs text-text-muted bg-surface-1 rounded-full border border-border-main">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 group animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
          isUser
            ? 'bg-ember/20 border border-ember/30'
            : 'bg-surface-2 border border-border-main'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-ember" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-text-secondary" />
        )}
      </div>

      <div className={`flex flex-col max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-text-muted">
            {isUser ? 'You' : 'Phoenix'}
          </span>
          <span className="text-xs text-text-muted font-code">
            {new Date(message.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div
          className={`relative rounded-lg px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-ember/15 border border-ember/25 text-primary specular-highlight'
              : 'surface-panel text-text-primary'
          }`}
        >
          <MessageContent content={message.content} />

          {isStreaming && !message.content && (
            <div className="flex items-center gap-1 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse-ember" />
              <div className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse-ember" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse-ember" style={{ animationDelay: '0.4s' }} />
            </div>
          )}

          {isStreaming && message.content && (
            <span className="inline-block w-2 h-4 bg-ember ml-0.5 animate-cursor-blink" />
          )}

          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.toolCalls.map((tc) => (
                <ToolCallBlock key={tc.id} call={tc} />
              ))}
            </div>
          )}

          {!isUser && !isStreaming && message.content && (
            <button
              onClick={handleCopy}
              className="absolute -top-2 -right-2 p-1.5 rounded bg-surface-2 border border-border-main opacity-0 group-hover:opacity-100 transition-opacity hover:border-border-highlight"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <Copy className="w-3 h-3 text-text-muted" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3);
          const firstNewline = lines.indexOf('\n');
          const lang = firstNewline > 0 ? lines.slice(0, firstNewline).trim() : '';
          const code = firstNewline > 0 ? lines.slice(firstNewline + 1) : lines;
          return (
            <pre key={i} className="my-2 p-3 terminal-bg rounded-lg text-xs font-code overflow-x-auto border border-border-main">
              {lang && (
                <div className="text-xs text-text-muted mb-2 uppercase tracking-wider">{lang}</div>
              )}
              <code className="text-text-secondary">{code}</code>
            </pre>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ToolCallBlock({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border-main rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 terminal-bg hover:bg-surface-1 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-text-muted" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted" />
        )}
        <span className="text-xs font-code text-tertiary">{call.name}</span>
        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
          call.status === 'running'
            ? 'bg-ember/20 text-ember'
            : call.status === 'complete'
              ? 'bg-success/20 text-success'
              : call.status === 'failed'
                ? 'bg-error/20 text-error'
                : 'bg-surface-2 text-text-muted'
        }`}>
          {call.status}
        </span>
      </button>
      {expanded && (
        <div className="p-3 terminal-bg border-t border-border-main animate-fade-in">
          <div className="text-xs font-code text-text-muted mb-1">Arguments:</div>
          <pre className="text-xs font-code text-text-secondary overflow-x-auto">
            {JSON.stringify(call.arguments, null, 2)}
          </pre>
          {call.result && (
            <>
              <div className="text-xs font-code text-text-muted mt-2 mb-1">Result:</div>
              <pre className="text-xs font-code text-text-secondary overflow-x-auto max-h-32 overflow-y-auto">
                {call.result}
              </pre>
            </>
          )}
          {call.error && (
            <div className="text-xs font-code text-error mt-2">{call.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
