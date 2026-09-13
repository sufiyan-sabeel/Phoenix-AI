import { type ToolCall } from '../lib/api';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { useState } from 'react';

interface ToolActivityProps {
  toolCalls: ToolCall[];
}

export default function ToolActivity({ toolCalls }: ToolActivityProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (toolCalls.length === 0) {
    return (
      <div className="p-4 text-sm text-text-muted text-center">
        No tool activity yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {toolCalls.map((call) => {
        const isExpanded = expanded[call.id] || false;
        return (
          <div key={call.id} className="border-b border-border-main last:border-0">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [call.id]: !prev[call.id] }))}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              )}

              <ToolStatusIcon status={call.status} />

              <Wrench className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
              <span className="text-sm font-code text-text-primary truncate flex-1">
                {call.name}
              </span>

              {call.completedAt && call.startedAt && (
                <span className="text-xs text-text-muted font-code">
                  {call.completedAt - call.startedAt}ms
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-2 animate-fade-in">
                <div className="text-xs text-text-secondary">
                  <span className="text-text-muted">Arguments:</span>
                  <pre className="mt-1 p-2 terminal-bg rounded text-xs font-code overflow-x-auto text-text-secondary">
                    {JSON.stringify(call.arguments, null, 2)}
                  </pre>
                </div>
                {call.result && (
                  <div className="text-xs text-text-secondary">
                    <span className="text-text-muted">Result:</span>
                    <pre className="mt-1 p-2 terminal-bg rounded text-xs font-code overflow-x-auto text-text-secondary max-h-40 overflow-y-auto">
                      {call.result}
                    </pre>
                  </div>
                )}
                {call.error && (
                  <div className="text-xs text-error">
                    <span className="text-text-muted">Error:</span>
                    <pre className="mt-1 p-2 terminal-bg rounded text-xs font-code overflow-x-auto max-h-40 overflow-y-auto">
                      {call.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToolStatusIcon({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <div className="w-3.5 h-3.5 rounded-full border border-text-muted flex-shrink-0" />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-ember animate-spin flex-shrink-0" />;
    case 'complete':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />;
  }
}
