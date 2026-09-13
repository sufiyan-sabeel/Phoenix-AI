import { useState, useCallback, useRef, useEffect } from 'react';
import { streamChat, type ChatMessage, type ToolCall } from '../lib/api';

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  activeToolCalls: ToolCall[];
  error: string | null;
}

export function useChat(sessionId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    activeToolCalls: [],
    error: null,
  });

  const abortRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = state.messages;

  const sendMessage = useCallback(
    async (content: string, model?: string) => {
      if (!sessionId || !content.trim() || state.isStreaming) return;

      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage, assistantMessage],
        isStreaming: true,
        streamingContent: '',
        activeToolCalls: [],
        error: null,
      }));

      abortRef.current = false;

      await streamChat(sessionId, content, {
        onToken: (token) => {
          setState((prev) => ({
            ...prev,
            streamingContent: prev.streamingContent + token,
            messages: prev.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: m.content + token }
                : m,
            ),
          }));
        },
        onToolCall: (call) => {
          setState((prev) => {
            const existing = prev.activeToolCalls.find((tc) => tc.id === call.id);
            if (existing) {
              return {
                ...prev,
                activeToolCalls: prev.activeToolCalls.map((tc) =>
                  tc.id === call.id ? call : tc,
                ),
              };
            }
            return {
              ...prev,
              activeToolCalls: [...prev.activeToolCalls, call],
              messages: prev.messages.map((m) =>
                m.id === assistantMessage.id
                  ? {
                      ...m,
                      toolCalls: [...(m.toolCalls || []), call],
                    }
                  : m,
              ),
            };
          });
        },
        onComplete: (_fullText) => {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            streamingContent: '',
          }));
        },
        onError: (error) => {
          setState((prev) => ({
            ...prev,
            isStreaming: false,
            streamingContent: '',
            error,
            messages: prev.messages.map((m) =>
              m.id === assistantMessage.id
                ? {
                    ...m,
                    content: m.content || `[Error: ${error}]`,
                  }
                : m,
            ),
          }));
        },
      }, model);
    },
    [sessionId, state.isStreaming],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current = true;
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      streamingContent: '',
    }));
  }, []);

  const setMessages = useCallback((messages: ChatMessage[]) => {
    setState((prev) => ({ ...prev, messages }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const clearMessages = useCallback(() => {
    setState({
      messages: [],
      isStreaming: false,
      streamingContent: '',
      activeToolCalls: [],
      error: null,
    });
  }, []);

  useEffect(() => {
    if (!sessionId) {
      clearMessages();
    }
  }, [sessionId, clearMessages]);

  return {
    ...state,
    sendMessage,
    stopStreaming,
    setMessages,
    clearError,
    clearMessages,
  };
}
