import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Flame, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim() || !password.trim()) return;
    try {
      await login(serverUrl.replace(/\/+$/, ''), password);
      navigate('/chat');
    } catch {
      // error is handled by auth context
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111317] relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ember/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fire/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-ember/3 rounded-full blur-[200px]" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-ember/15 border border-ember/25 flex items-center justify-center mb-4 glow-ember">
            <Flame className="w-8 h-8 text-ember" />
          </div>
          <h1 className="text-3xl font-headline font-bold text-text-primary tracking-tight">
            PHOENIX
          </h1>
          <p className="text-sm text-text-muted mt-1 font-headline">
            Spatial Intelligence Engine
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="surface-panel p-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                Server URL
              </label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => {
                  setServerUrl(e.target.value);
                  clearError();
                }}
                placeholder="https://your-server.com:8080"
                required
                className="w-full px-4 py-3 rounded-lg bg-surface-2 border border-border-main text-text-primary text-sm placeholder:text-text-muted outline-none focus:border-ember/50 focus:ring-1 focus:ring-ember/25 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  placeholder="Enter password"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-surface-2 border border-border-main text-text-primary text-sm placeholder:text-text-muted outline-none focus:border-ember/50 focus:ring-1 focus:ring-ember/25 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/25 text-sm text-error animate-fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !serverUrl.trim() || !password.trim()}
              className="w-full ember-button flex items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Connect to PHOENIX Server
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <p className="text-center text-xs text-text-muted">
            Enter your PHOENIX server credentials to begin
          </p>
        </form>
      </div>
    </div>
  );
}
