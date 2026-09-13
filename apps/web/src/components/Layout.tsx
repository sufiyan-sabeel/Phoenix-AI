import { useState, type ReactNode } from 'react';
import Sidebar from './Sidebar';
import ServerStatus from './ServerStatus';
import { PanelLeft, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  rightPanel?: ReactNode;
  topBar?: ReactNode;
  sessions?: Array<{ id: string; title: string; messageCount: number; updatedAt: number; createdAt: number }>;
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onSettings?: () => void;
}

export default function Layout({
  children,
  sidebar: rightSidebar,
  topBar,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewChat,
  onSettings,
}: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#111317]">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId || null}
          onSelectSession={onSelectSession || (() => {})}
          onNewChat={onNewChat || (() => {})}
          onSettings={onSettings || (() => {})}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-obsidian/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 bg-graphite border-r border-border-main">
            <Sidebar
              sessions={sessions}
              activeSessionId={activeSessionId || null}
              onSelectSession={(id) => {
                onSelectSession?.(id);
                setMobileMenuOpen(false);
              }}
              onNewChat={() => {
                onNewChat?.();
                setMobileMenuOpen(false);
              }}
              onSettings={() => {
                onSettings?.();
                setMobileMenuOpen(false);
              }}
              isCollapsed={false}
              onToggleCollapse={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-main bg-graphite">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded hover:bg-surface-2 transition-colors text-text-muted"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-ember/20 border border-ember/30 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-ember" />
              </div>
              <span className="text-sm font-headline font-medium text-text-primary hidden sm:block">
                PHOENIX
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {topBar}
            <ServerStatus compact />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            {children}
          </div>
          {rightSidebar && (
            <div className="hidden lg:block">{rightSidebar}</div>
          )}
        </div>
      </div>
    </div>
  );
}
