<div align="center">

# 🔥 PHOENIX

### Open-source AI agent platform for terminal, Android, and web

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/umaiz-sufiyan/phoenix/releases)
[![Platform](https://img.shields.io/badge/platform-Termux%20%7C%20CLI%20%7C%20Web%20%7C%20Telegram-brightgreen.svg)](https://github.com/umaiz-sufiyan/phoenix)

**Created and maintained by [Umaiz Sufiyan](https://github.com/umaiz-sufiyan)**

</div>

---

## Features

- **G1** Multi-provider AI support — Gemini, OpenAI, Anthropic, OpenRouter, Ollama
- **G2** 76+ built-in tools — terminal, filesystem, git, ADB, web, Python execution
- **G3** MCP connector system with encrypted credential vault
- **G4** Layered memory — session, project, preferences, decisions, errors, long-term
- **G5** Web workspace with Phoenix Spatial Engine design system
- **G6** CLI with local and remote connection modes
- **G7** Telegram bot integration for mobile-first interaction
- **G8** Voice input/output support across all clients
- **G9** Automation workflow engine with Zapier MCP integration
- **G10** Extension system for custom tools and skills
- **G11** Direct ADB device control — no Shizuku or Rish required
- **G12** Subagent orchestration with agent modes (planner, builder, reviewer, tester, debugger)

## Architecture

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Web UI    │   │   CLI       │   │  Telegram   │
│  (React)    │   │  (Node)     │   │   Bot       │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────┬────────┘────────┬────────┘
                │                 │
         ┌──────▼─────────────────▼──────┐
         │        PHOENIX Server         │
         │     (WebSocket + REST API)    │
         └──────────────┬───────────────┘
                        │
         ┌──────────────▼───────────────┐
         │        Core Engine           │
         │  ┌─────────┐ ┌───────────┐  │
         │  │  Agent   │ │   Tools   │  │
         │  │ Executor │ │ Registry  │  │
         │  └─────────┘ └───────────┘  │
         │  ┌─────────┐ ┌───────────┐  │
         │  │   MCP   │ │  Memory   │  │
         │  │Connector│ │  System   │  │
         │  └─────────┘ └───────────┘  │
         │  ┌─────────┐ ┌───────────┐  │
         │  │Provider │ │Extension  │  │
         │  │ Router  │ │  System   │  │
         │  └─────────┘ └───────────┘  │
         └──────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm run server

# Open the web UI
# Navigate to http://localhost:3000 in your browser
```

## Installation

| Method | Command | Platform |
|--------|---------|----------|
| **Termux** | `pkg install phoenix-ai` | Android |
| **CLI Binary** | `curl -fsSL https://phoenix.dev/install.sh \| bash` | Linux / macOS |
| **GitHub Releases** | Download from [Releases](https://github.com/umaiz-sufiyan/phoenix/releases) | All |
| **Docker** | `docker run -p 3000:3000 phoenixai/phoenix` | All |
| **npm** | `npm install -g @phoenix/cli` | Node.js |

## Configuration

PHOENIX uses environment variables and a `phoenix.config.json` file at the project root.

### Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Authentication
PHOENIX_SECRET_KEY=your-secret-key
PHOENIX_JWT_SECRET=your-jwt-secret

# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Provider Setup

### Gemini (Google)

```bash
export GEMINI_API_KEY=your-gemini-api-key
```

### OpenAI

```bash
export OPENAI_API_KEY=your-openai-api-key
```

### Anthropic

```bash
export ANTHROPIC_API_KEY=your-anthropic-api-key
```

### OpenRouter

```bash
export OPENROUTER_API_KEY=your-openrouter-api-key
```

### Ollama (Local)

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

## MCP Connector Setup

PHOENIX supports Model Context Protocol connectors for extending agent capabilities.

```json
{
  "connectors": [
    {
      "name": "filesystem",
      "type": "mcp",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    },
    {
      "name": "database",
      "type": "mcp",
      "transport": "sse",
      "endpoint": "http://localhost:8080/sse"
    }
  ]
}
```

## Telegram Bot Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Set the bot token:
   ```bash
   export TELEGRAM_BOT_TOKEN=your-bot-token
   ```
3. Start the server — the bot will register automatically
4. Send `/start` to your bot to begin a session

## Development

```bash
# Clone the repository
git clone https://github.com/umaiz-sufiyan/phoenix.git
cd phoenix

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Project Structure

```
phoenix/
├── packages/
│   ├── core/          # Core engine, agent, tools, memory
│   ├── server/        # WebSocket & REST API server
│   ├── cli/           # Command-line interface
│   └── shared/        # Shared types and utilities
├── apps/
│   └── web/           # React web workspace
├── extensions/        # Built-in extensions
├── supabase/          # Database migrations
└── docs/              # Documentation
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

## Credits

**Created and maintained by [Umaiz Sufiyan](https://github.com/umaiz-sufiyan)**

Built with passion for the open-source AI community.
