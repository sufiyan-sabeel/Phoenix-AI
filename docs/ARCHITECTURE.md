# PHOENIX Architecture

## Overview

PHOENIX is built as a TypeScript monorepo managed by pnpm workspaces. The platform is divided into four layers: clients, server, core engine, and integrations.

## Monorepo Structure

```
phoenix/
├── packages/
│   ├── core/            # Core engine, agent runtime, tools, memory
│   ├── server/          # HTTP/WebSocket server, REST API, session management
│   ├── cli/             # Command-line interface (local + remote modes)
│   └── shared/          # Shared types, constants, utilities
├── apps/
│   └── web/             # React web workspace (Phoenix Spatial Engine)
├── extensions/          # Built-in extensions and plugins
├── supabase/
│   └── migrations/      # Database schema migrations
└── docs/                # Project documentation
```

## Data Flow

```
User Input (text/voice/file)
        │
        ▼
┌───────────────────┐
│   Client Layer    │
│  (Web/CLI/TG)     │
└────────┬──────────┘
         │ WebSocket / HTTP
         ▼
┌───────────────────┐
│   Server Layer    │
│  Auth │ Sessions  │
│  Rate │ CORS     │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   Core Engine     │
│                   │
│  ┌──────────────┐ │
│  │ Agent Router │ │  Selects model, provider, mode
│  └──────┬───────┘ │
│         │         │
│  ┌──────▼───────┐ │
│  │ Tool System  │ │  76+ tools, sandboxed execution
│  └──────┬───────┘ │
│         │         │
│  ┌──────▼───────┐ │
│  │ MCP Layer    │ │  External tool connectors
│  └──────┬───────┘ │
│         │         │
│  ┌──────▼───────┐ │
│  │ Memory Sys   │ │  6-layer memory architecture
│  └──────────────┘ │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│   Integrations    │
│  Providers │ MCP  │
│  Zapier   │ ADB  │
│  Telegram │ Voice │
└───────────────────┘
```

## Package Responsibilities

### `@phoenix/core`

The central package containing all business logic.

- **Agent Runtime**: Orchestrates LLM calls, tool execution, and conversation flow
- **Tool Registry**: Manages 76+ built-in tools across categories (terminal, filesystem, git, ADB, web, Python)
- **Memory System**: Six-layer architecture for context persistence
- **Provider Abstraction**: Unified interface for Gemini, OpenAI, Anthropic, OpenRouter, Ollama
- **MCP Client**: Connects to external tool servers via Model Context Protocol
- **Extension System**: Dynamic loading of custom tools and skills

### `@phoenix/server`

HTTP and WebSocket server for client connections.

- **REST API**: Session management, user auth, file uploads
- **WebSocket Hub**: Real-time bidirectional communication
- **Authentication**: JWT-based auth with optional Supabase integration
- **Rate Limiting**: Per-user and per-session request throttling
- **CORS**: Configurable cross-origin policies

### `@phoenix/cli`

Command-line interface for terminal users.

- **Local Mode**: Runs the agent directly in the terminal process
- **Remote Mode**: Connects to a running PHOENIX server
- **Session Management**: Create, list, resume sessions
- **Configuration**: `phoenix.config.json` management
- **Device Control**: ADB commands for connected Android devices

### `@phoenix/shared`

Types, constants, and utilities shared across all packages.

- **Type Definitions**: Interfaces for messages, sessions, tools, memory
- **Constants**: Default configurations, error codes, tool categories
- **Utilities**: Formatting, validation, crypto helpers

### `@phoenix/web`

React-based web workspace.

- **Phoenix Spatial Engine**: Design system with custom tokens
- **Chat Interface**: Real-time messaging with tool execution display
- **Session Dashboard**: History, memory viewer, workflow management
- **Settings Panel**: Provider configuration, MCP connectors, preferences
- **File Viewer**: Inline display of generated and uploaded files

## oh-my-pi Integration

oh-my-pi is an optional module for Raspberry Pi and ARM-based devices.

- **Isolated**: Lives in a separate optional package, not loaded by default
- **Feature-flagged**: Enabled via `PHOENIX_ENABLE_PI=true` environment variable
- **Capabilities**: GPIO control, sensor reading, hardware-specific optimizations
- **Scope**: Only loaded when running on supported ARM hardware

## Security Model

### Authentication

- JWT tokens for API access
- Supabase Auth integration for user management
- Optional API key authentication for programmatic access

### Authorization

- Per-user data isolation
- Session-level access control
- Tool execution permissions (sandboxed by default)

### Data Protection

- MCP credentials encrypted at rest
- No secrets logged or exposed in error messages
- Environment variable isolation between providers

### Tool Sandboxing

- Terminal commands run in restricted shells
- Filesystem access limited to configured directories
- Network access controlled per-tool
- ADB commands validated against allowlists

## Permission System

PHOENIX implements a layered permission system:

| Layer | Scope | Description |
|-------|-------|-------------|
| Global | Server-wide | Server admin settings, rate limits |
| User | Per-user | Provider access, MCP connectors, memory |
| Session | Per-session | Tool permissions, model selection |
| Tool | Per-call | Individual tool execution authorization |

Each tool call passes through the permission chain:

1. **Authentication check** — valid JWT or API key
2. **User authorization** — user has access to requested provider/tool
3. **Session scope** — tool is enabled for this session
4. **Rate limit** — request is within allowed limits
5. **Sandbox** — execution environment is properly isolated
