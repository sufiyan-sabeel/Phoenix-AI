import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useChat } from '../hooks/useChat';
import {
  fetchSessions,
  createSession,
  fetchSessionMessages,
  fetchModels,
  type ChatSession,
  type ModelInfo,
  type TerminalLine,
} from '../lib/api';
import Layout from '../components/Layout';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import ToolActivity from '../components/ToolActivity';
import TerminalPane from '../components/TerminalPane';
import ModelSelector from '../components/ModelSelector';
import MemoryPanel from '../components/MemoryPanel';
import SettingsPanel from '../components/SettingsPanel';
import { Memory, Terminal, X } from 'lucide-react';

export default function ChatWorkspace() {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(urlSessionId || null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showToolPanel, setShowToolPanel] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    activeToolCalls,
    sendMessage,
    setMessages,
    clearMessages,
  } = useChat(activeSessionId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    fetchSessions().then((res) => {
      if (res.ok && res.data) {
        setSessions(res.data);
      }
    });
    fetchModels().then((res) => {
      if (res.ok && res.data) {
        setModels(res.data);
        if (res.data.length > 0 && !selectedModel) {
          setSelectedModel(res.data[0].id);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (urlSessionId) {
      setActiveSessionId(urlSessionId);
      fetchSessionMessages(urlSessionId).then((res) => {
        if (res.ok && res.data) {
          setMessages(res.data);
        }
      });
    }
  }, [urlSessionId, setMessages]);

  const handleNewChat = useCallback(async () => {
    try {
      const res = await createSession();
      if (res.ok && res.data) {
        setSessions((prev) => [res.data!, ...prev]);
        setActiveSessionId(res.data.id);
        clearMessages();
        navigate(`/chat/${res.data.id}`);
      }
    } catch {
      // error handling
    }
  }, [clearMessages, navigate]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      setActiveSessionId(id);
      navigate(`/chat/${id}`);
      clearMessages();
      const res = await fetchSessionMessages(id);
      if (res.ok && res.data) {
        setMessages(res.data);
      }
    },
    [navigate, clearMessages, setMessages],
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeSessionId) {
        await handleNewChat();
        return;
      }
      sendMessage(content, selectedModel);
    },
    [activeSessionId, sendMessage, selectedModel, handleNewChat],
  );

  const handleStop = useCallback(() => {
    // streaming stop is handled by useChat
  }, []);

  const handleClearTerminal = useCallback(() => {
    setTerminalLines([]);
  }, []);

  const handleSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  return (
    <Layout
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewChat={handleNewChat}
      onSettings={handleSettings}
      topBar={
        <div className="flex items-center gap-2">
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            disabled={isStreaming}
          />
          <button
            onClick={() => setShowToolPanel(!showToolPanel)}
            className={`p-1.5 rounded transition-colors ${
              showToolPanel
                ? 'bg-ember/15 text-ember'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
            }`}
            title="Tool Activity"
          >
            <Memory className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`p-1.5 rounded transition-colors ${
              showTerminal
                ? 'bg-ember/15 text-ember'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-2'
            }`}
            title="Terminal"
          >
            <Terminal className="w-4 h-4" />
          </button>
        </div>
      }
      rightPanel={
        showMemory ? (
          <MemoryPanel onClose={() => setShowMemory(false)} />
        ) : showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : null
      }
    >
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            {messages.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-ember/10 border border-ember/20 flex items-center justify-center mb-6 glow-ember">
                  <div className="w-8 h-8 rounded-full bg-ember/30" />
                </div>
                <h2 className="text-xl font-headline font-semibold text-text-primary mb-2">
                  Start a conversation
                </h2>
                <p className="text-sm text-text-muted max-w-md">
                  Ask PHOENIX anything. Use tools, access memory, and explore
                  the spatial intelligence engine.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3 max-w-md">
                  {[
                    'Analyze this data set',
                    'Help me write code',
                    'Search my memory',
                    'Set up a workflow',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      className="px-4 py-3 rounded-lg surface-panel text-sm text-text-secondary hover:text-text-primary hover:border-border-highlight transition-colors text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border-main bg-graphite">
            <div className="max-w-3xl mx-auto">
              <ChatInput
                onSend={handleSend}
                onStop={handleStop}
                isStreaming={isStreaming}
                placeholder={
                  activeSessionId
                    ? 'Message PHOENIX...'
                    : 'Start a new conversation...'
                }
              />
            </div>
          </div>
        </div>

        {/* Tool Activity Panel */}
        {showToolPanel && (
          <div className="w-72 border-l border-border-main bg-graphite flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-main">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Tool Activity
              </span>
              <button
                onClick={() => setShowToolPanel(false)}
                className="p-1 rounded hover:bg-surface-2 text-text-muted transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ToolActivity toolCalls={activeToolCalls} />
            </div>
          </div>
        )}

        {/* Terminal Panel */}
        {showTerminal && (
          <div className="w-80 border-l border-border-main bg-graphite flex flex-col animate-fade-in">
            <TerminalPane lines={terminalLines} onClear={handleClearTerminal} />
          </div>
        )}
      </div>
    </Layout>
  );
}
