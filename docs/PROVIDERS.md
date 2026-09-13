# Provider Setup Guide

PHOENIX supports multiple AI providers through a unified interface. Configure one or more providers to enable model access.

## Gemini (Google AI)

### Setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Set the environment variable:
   ```bash
   export GEMINI_API_KEY=your-gemini-api-key
   ```

### Supported Models

| Model | Context | Best For |
|-------|---------|----------|
| `gemini-2.5-flash` | 1M tokens | Fast, cost-effective tasks |
| `gemini-2.5-pro` | 1M tokens | Complex reasoning, code |
| `gemini-2.0-flash` | 1M tokens | General purpose |

### Configuration

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "temperature": 0.7,
  "maxTokens": 8192
}
```

## OpenAI

### Setup

1. Get an API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Set the environment variable:
   ```bash
   export OPENAI_API_KEY=your-openai-api-key
   ```

### Supported Models

| Model | Context | Best For |
|-------|---------|----------|
| `gpt-4o` | 128K tokens | Balanced performance |
| `gpt-4o-mini` | 128K tokens | Fast, cost-effective |
| `gpt-4-turbo` | 128K tokens | Complex tasks |
| `o1` | 200K tokens | Reasoning, math |

### Configuration

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

## Anthropic

### Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. Set the environment variable:
   ```bash
   export ANTHROPIC_API_KEY=your-anthropic-api-key
   ```

### Supported Models

| Model | Context | Best For |
|-------|---------|----------|
| `claude-sonnet-4-20250514` | 200K tokens | Balanced, extended thinking |
| `claude-3-5-haiku-20241022` | 200K tokens | Fast responses |
| `claude-3-opus-20240229` | 200K tokens | Highest capability |

### Configuration

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

## OpenRouter

OpenRouter provides access to hundreds of models through a single API.

### Setup

1. Get an API key from [openrouter.ai](https://openrouter.ai/keys)
2. Set the environment variable:
   ```bash
   export OPENROUTER_API_KEY=your-openrouter-api-key
   ```

### Popular Models

| Model | Context | Best For |
|-------|---------|----------|
| `anthropic/claude-sonnet-4-20250514` | 200K | General purpose |
| `openai/gpt-4o` | 128K | Code, reasoning |
| `google/gemini-2.5-flash` | 1M | Fast, large context |
| `meta-llama/llama-3.1-405b` | 128K | Open-source, capable |

### Configuration

```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4-20250514",
  "temperature": 0.7,
  "maxTokens": 4096,
  "siteName": "PHOENIX",
  "siteUrl": "https://phoenix.dev"
}
```

## Ollama (Local)

Ollama runs models locally on your machine.

### Setup

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model: `ollama pull llama3.1`
3. Ollama is configured by default at `http://localhost:11434`

### Environment Variable

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

### Supported Models

Any model available in Ollama's library:

| Model | Size | Best For |
|-------|------|----------|
| `llama3.1` | 8B/70B | General purpose |
| `codellama` | 7B-34B | Code generation |
| `mistral` | 7B | Fast responses |
| `qwen2.5-coder` | 7B-32B | Coding tasks |

### Configuration

```json
{
  "provider": "ollama",
  "model": "llama3.1",
  "baseUrl": "http://localhost:11434",
  "temperature": 0.7
}
```

## Multi-Provider Configuration

PHOENIX can use multiple providers simultaneously. Configure fallbacks and routing:

```json
{
  "providers": {
    "default": "gemini",
    "fallbacks": ["openai", "anthropic"],
    "routing": {
      "code": "anthropic",
      "reasoning": "openai",
      "creative": "gemini"
    }
  }
}
```

### Provider Selection Logic

1. Use the configured default provider
2. If the default fails, try the first available fallback
3. For specific task types, use the routing configuration
4. If all providers fail, return an error with details

## Provider-Specific Features

### Extended Thinking

Anthropic and Gemini support extended thinking for complex reasoning:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "extendedThinking": true,
  "thinkingBudget": 10000
}
```

### Function Calling

All providers support function calling (tool use). PHOENIX normalizes the interface across providers.

### Streaming

All providers support streaming responses. PHOENIX uses Server-Sent Events (SSE) to stream to clients.

## Troubleshooting

### Common Issues

**API key not found**
- Ensure the environment variable is set in your shell
- Check for typos in the variable name
- Verify the key is active in the provider's dashboard

**Model not available**
- Check if the model is available in your region
- Verify your API tier supports the model
- For OpenRouter, check if the model is currently online

**Rate limited**
- PHOENIX implements automatic retry with exponential backoff
- Consider upgrading your API tier
- Use a different provider as fallback

**Connection refused (Ollama)**
- Ensure Ollama is running: `ollama serve`
- Check the base URL is correct
- Verify the model is pulled: `ollama list`
