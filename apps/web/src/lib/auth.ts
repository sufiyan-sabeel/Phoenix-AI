import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { loginToServer, fetchServerInfo, type ServerInfo } from './api';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  serverUrl: string;
  serverInfo: ServerInfo | null;
  isLoading: boolean;
  error: string | null;
  login: (serverUrl: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'phoenix_auth_token';
const SERVER_URL_KEY = 'phoenix_server_url';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [serverUrl, setServerUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(SERVER_URL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token && !!serverUrl;

  useEffect(() => {
    if (isAuthenticated && serverUrl) {
      fetchServerInfo()
        .then((res) => {
          if (res.ok && res.data) {
            setServerInfo(res.data);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, serverUrl]);

  const login = useCallback(async (url: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loginToServer(url, password);
      setToken(result.token);
      setServerInfo(result.serverInfo);
      setServerUrl(url);
      try {
        sessionStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem(SERVER_URL_KEY, url);
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setServerInfo(null);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        serverUrl,
        serverInfo,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
