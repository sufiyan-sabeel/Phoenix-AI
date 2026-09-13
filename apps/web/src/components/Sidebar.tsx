import { useState } from 'react';
import { type ChatSession } from '../lib/api';
import { Plus, MessageSquare, Settings, Search, PanelLeftClose, PanelLeft } from 'lucide-react';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onSettings,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (isCollapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-3 gap-3 border-r border-border-main bg-graphite">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg bg-ember text-obsidian hover:bg-ember-light transition-colors"
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={onSettings}
          className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex flex-col border-r border-border-main bg-graphite">
      <div className="flex items-center justify-between p-3 border-b border-border-main">
        <span className="text-sm font-medium text-text-primary font-headline">Chats</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-surface-2 transition-colors text-text-muted"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className="p-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-ember/10 border border-ember/25 text-ember hover:bg-ember/20 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded bg-surface-1 border border-border-main text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-ember/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtered.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
              session.id === activeSessionId
                ? 'bg-surface-2 border border-border-highlight text-text-primary'
                : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{session.title}</div>
              <div className="text-xs text-text-muted font-code">
                {session.messageCount} msgs
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-text-muted">
            {searchQuery ? 'No matching chats' : 'No chats yet'}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-border-main">
        <button
          onClick={onSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-1 hover:text-text-primary transition-colors text-sm"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
