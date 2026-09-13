import { z } from 'zod';

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3777),
  corsOrigins: z.array(z.string()).default(['http://localhost:5173']),
  auth: z.object({
    secret: z.string().min(16, 'Auth secret must be at least 16 characters'),
    tokenExpiry: z.number().int().positive().default(86400),
  }),
  providers: z.object({
    gemini: z.string().optional(),
    openai: z.string().optional(),
    anthropic: z.string().optional(),
    openrouter: z.string().optional(),
  }),
  supabase: z.object({
    url: z.string().url().optional(),
    anonKey: z.string().optional(),
  }).optional(),
});

export type ServerConfig = z.infer<typeof ConfigSchema>;

function loadEnvConfig(): ServerConfig {
  const raw = {
    port: parseInt(process.env['PORT'] ?? '3777', 10),
    corsOrigins: (process.env['PHOENIX_CORS_ORIGINS'] ?? 'http://localhost:5173')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    auth: {
      secret: process.env['PHOENIX_AUTH_SECRET'] ?? 'dev-secret-change-in-production-min-16-chars',
      tokenExpiry: parseInt(process.env['PHOENIX_AUTH_TOKEN_EXPIRY'] ?? '86400', 10),
    },
    providers: {
      gemini: process.env['PHOENIX_GEMINI_API_KEY'] || undefined,
      openai: process.env['PHOENIX_OPENAI_API_KEY'] || undefined,
      anthropic: process.env['PHOENIX_ANTHROPIC_API_KEY'] || undefined,
      openrouter: process.env['PHOENIX_OPENROUTER_API_KEY'] || undefined,
    },
    supabase: {
      url: process.env['PHOENIX_SUPABASE_URL'] || undefined,
      anonKey: process.env['PHOENIX_SUPABASE_ANON_KEY'] || undefined,
    },
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('[config] Validation errors:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

let _config: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (!_config) {
    _config = loadEnvConfig();
  }
  return _config;
}

export function getApiKeyForProvider(provider: string): string | undefined {
  const config = getConfig();
  const keyMap: Record<string, string | undefined> = {
    gemini: config.providers.gemini,
    openai: config.providers.openai,
    anthropic: config.providers.anthropic,
    openrouter: config.providers.openrouter,
  };
  return keyMap[provider];
}
