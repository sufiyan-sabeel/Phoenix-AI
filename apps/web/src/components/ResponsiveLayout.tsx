import { type ReactNode } from 'react';
import { MessageSquare, Settings, Menu, X } from 'lucide-react';

interface ResponsiveLayoutProps {
  children: ReactNode;
  activeView: 'chat' | 'settings';
  onNavigate: (view: 'chat' | 'settings') => void;
}

export default function ResponsiveLayout({
  children,
  activeView,
  onNavigate,
}: ResponsiveLayoutProps) {
  return (
    <div className="flex flex-col h-screen md:flex-row">
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border-main bg-graphite">
        <nav className="flex items-center justify-around py-2">
          <button
            onClick={() => onNavigate('chat')}
            className={`flex flex-col items-center gap-1 px-4 py-1 rounded transition-colors ${
              activeView === 'chat'
                ? 'text-ember'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs">Chat</span>
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className={`flex flex-col items-center gap-1 px-4 py-1 rounded transition-colors ${
              activeView === 'settings'
                ? 'text-ember'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-xs">Settings</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden pb-16 md:pb-0">
        {children}
      </div>
    </div>
  );
}
