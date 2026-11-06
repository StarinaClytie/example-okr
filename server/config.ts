import { defaultAttachmentRateLimits, type AttachmentRateLimitConfig } from './rateLimit.js';

export interface ServerConfig {
  host: string;
  port: number;
  rateLimit: AttachmentRateLimitConfig;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  ossBucket: string;
  ossRegion: string;
  ossEndpoint: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string, fallbackName?: string): string {
  const value = env[name]?.trim() || (fallbackName ? env[fallbackName]?.trim() : '');
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function positiveInteger(env: Environment, name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid ${name}`);
  return value;
}

export function loadServerConfig(env: Environment): ServerConfig {
  const port = Number(env.ATTACHMENT_API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ATTACHMENT_API_PORT');
  return {
    host: env.ATTACHMENT_API_HOST?.trim() || '127.0.0.1',
    port,
    rateLimit: {
      windowMs: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_WINDOW_MS', defaultAttachmentRateLimits.windowMs, 2_147_483_647),
      globalLimit: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_GLOBAL_REQUESTS', defaultAttachmentRateLimits.globalLimit),
      userLimit: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_USER_REQUESTS', defaultAttachmentRateLimits.userLimit),
    },
    ossAccessKeyId: required(env, 'OSS_ACCESS_KEY_ID'),
    ossAccessKeySecret: required(env, 'OSS_ACCESS_KEY_SECRET'),
    ossBucket: required(env, 'OSS_BUCKET'),
    ossRegion: required(env, 'OSS_REGION'),
    ossEndpoint: required(env, 'OSS_ENDPOINT'),
    supabaseUrl: required(env, 'SUPABASE_URL', 'VITE_SUPABASE_URL'),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  };
}
