-- PHOENIX Supabase Schema

-- Users table (for auth)
CREATE TABLE IF NOT EXISTS phoenix_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS phoenix_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES phoenix_users(id) ON DELETE CASCADE,
  project_id TEXT,
  mode TEXT DEFAULT 'planner',
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS phoenix_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES phoenix_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Memory table
CREATE TABLE IF NOT EXISTS phoenix_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES phoenix_users(id) ON DELETE CASCADE,
  project_id TEXT,
  layer TEXT NOT NULL CHECK (layer IN ('session', 'project', 'preferences', 'decisions', 'errors', 'long-term')),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, project_id, layer, key)
);

-- MCP Connectors table
CREATE TABLE IF NOT EXISTS phoenix_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES phoenix_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  endpoint TEXT,
  auth_type TEXT,
  credentials_encrypted TEXT,
  scopes JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflows table
CREATE TABLE IF NOT EXISTS phoenix_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES phoenix_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_config JSONB NOT NULL,
  steps JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Files table
CREATE TABLE IF NOT EXISTS phoenix_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES phoenix_users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES phoenix_sessions(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sessions_user ON phoenix_sessions(user_id);
CREATE INDEX idx_messages_session ON phoenix_messages(session_id);
CREATE INDEX idx_memory_user_project ON phoenix_memory(user_id, project_id);
CREATE INDEX idx_memory_layer ON phoenix_memory(layer);
CREATE INDEX idx_connectors_user ON phoenix_connectors(user_id);
CREATE INDEX idx_workflows_user ON phoenix_workflows(user_id);
CREATE INDEX idx_files_user ON phoenix_files(user_id);
