# Deployment Guide

## Server Deployment

### Docker

```bash
# Build the image
docker build -t phoenix .

# Run with environment variables
docker run -d \
  --name phoenix \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PHOENIX_SECRET_KEY=your-secret \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_ANON_KEY=your-key \
  phoenix
```

### Docker Compose

```yaml
version: '3.8'
services:
  phoenix:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PHOENIX_SECRET_KEY=${PHOENIX_SECRET_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - phoenix-data:/app/data
    restart: unless-stopped

volumes:
  phoenix-data:
```

### Bare Node.js

```bash
# Install production dependencies
pnpm install --prod

# Build all packages
pnpm build

# Set environment
export NODE_ENV=production
export PORT=3000

# Start the server
node packages/server/dist/index.js
```

### Termux (Android)

```bash
# Install Termux from F-Droid (not Play Store)
pkg update && pkg upgrade
pkg install nodejs git

# Clone and build
git clone https://github.com/umaiz-sufiyan/phoenix.git
cd phoenix
npm install
npm run build

# Start
npm run server
```

## Web Deployment

### GitHub Pages

The web app is automatically deployed to GitHub Pages on push to `main`.

1. Enable GitHub Pages in repository settings
2. Set source to "GitHub Actions"
3. Push to `main` — deployment triggers automatically

### Manual Deployment

```bash
# Build the web app
pnpm --filter @phoenix/web build

# The output is in apps/web/dist/
# Deploy to any static hosting provider
```

## CLI Installation

```bash
# Global install
npm install -g @phoenix/cli

# Or via curl
curl -fsSL https://phoenix.dev/install.sh | bash

# Connect to remote server
phoenix connect wss://your-server.com:3000

# Or run locally
phoenix local
```

## Environment Variables

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `NODE_ENV` | `development` | Environment mode |
| `PHOENIX_SECRET_KEY` | — | Encryption key for credentials |
| `PHOENIX_JWT_SECRET` | — | JWT signing secret |

### Database (Supabase)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Public anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin service role key |

### AI Providers

| Variable | Provider |
|----------|----------|
| `GEMINI_API_KEY` | Google Gemini |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENROUTER_API_KEY` | OpenRouter |
| `OLLAMA_BASE_URL` | Ollama (default: `http://localhost:11434`) |

### Integrations

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `ZAPIER_API_KEY` | Zapier MCP API key |

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `PHOENIX_ENABLE_VOICE` | `false` | Enable voice I/O |
| `PHOENIX_ENABLE_ADB` | `auto` | Enable ADB device control |
| `PHOENIX_ENABLE_PI` | `false` | Enable oh-my-pi integration |
| `PHOENIX_LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |

## CORS Configuration

PHOENIX configures CORS via environment variables:

```bash
# Allow specific origins (comma-separated)
CORS_ORIGINS=http://localhost:5173,https://phoenix.dev

# Allow all origins (development only)
CORS_ORIGINS=*

# Custom headers
CORS_HEADERS=Content-Type,Authorization,X-API-Key
```

### WebSocket CORS

WebSocket connections use the same CORS policy. Ensure your client origin is included in `CORS_ORIGINS`.

### Production CORS

In production, set explicit allowed origins:

```bash
CORS_ORIGINS=https://phoenix.yourdomain.com
```

## Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name phoenix.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/phoenix.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/phoenix.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

## Health Check

PHOENIX exposes a health endpoint:

```bash
curl http://localhost:3000/health
# Returns: { "status": "ok", "version": "0.1.0", "uptime": 12345 }
```
