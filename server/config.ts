import { defaultAttachmentRateLimits, type AttachmentRateLimitConfig } from './rateLimit.js';

export interface OssStorageConfig {
  provider: 'oss';
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
}
export interface S3StorageConfig {
  provider: 's3' | 'r2';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}
export interface ServerConfig {
  host: string;
  port: number;
  rateLimit: AttachmentRateLimitConfig;
  storage: OssStorageConfig | S3StorageConfig;
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

function endpoint(env: Environment, name: string, mandatory: boolean, allowBareHost = false): string | undefined {
  const raw = env[name]?.trim();
  if (!raw && !mandatory) return undefined;
  try {
    const value = allowBareHost && raw && !raw.includes('://') ? `https://${raw}` : raw;
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch { throw new Error(`Invalid ${name}`); }
}
function boolean(env: Environment, name: string, fallback: boolean): boolean {
  const value = env[name]?.trim();
  if (!value) return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`Invalid ${name}`);
  return value === 'true';
}
function storageConfig(env: Environment): ServerConfig['storage'] {
  const provider = env.ATTACHMENT_STORAGE_PROVIDER?.trim() || 'oss';
  if (provider === 'oss') return {
    provider,
    accessKeyId: required(env, 'OSS_ACCESS_KEY_ID'),
    accessKeySecret: required(env, 'OSS_ACCESS_KEY_SECRET'),
    bucket: required(env, 'OSS_BUCKET'),
    region: required(env, 'OSS_REGION'),
    endpoint: endpoint(env, 'OSS_ENDPOINT', true, true)!,
  };
  if (provider !== 's3' && provider !== 'r2') throw new Error('Invalid ATTACHMENT_STORAGE_PROVIDER');
  const serviceEndpoint = endpoint(env, 'S3_ENDPOINT', provider === 'r2');
  const region = provider === 'r2' ? (env.S3_REGION?.trim() || 'auto') : required(env, 'S3_REGION');
  if (provider === 'r2') {
    if (region !== 'auto') throw new Error('Invalid S3_REGION: R2 requires auto');
    if (!serviceEndpoint || !/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(serviceEndpoint)) throw new Error('Invalid S3_ENDPOINT for R2');
  }
  return {
    provider,
    accessKeyId: required(env, 'S3_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'S3_SECRET_ACCESS_KEY'),
    ...(env.S3_SESSION_TOKEN?.trim() ? { sessionToken: env.S3_SESSION_TOKEN.trim() } : {}),
    bucket: required(env, 'S3_BUCKET'), region,
    ...(serviceEndpoint ? { endpoint: serviceEndpoint } : {}),
    forcePathStyle: boolean(env, 'S3_FORCE_PATH_STYLE', provider === 'r2'),
  };
}
export function loadServerConfig(env: Environment): ServerConfig {
  const port = Number(env.ATTACHMENT_API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ATTACHMENT_API_PORT');
  return {
    host: env.ATTACHMENT_API_HOST?.trim() || '127.0.0.1', port,
    rateLimit: {
      windowMs: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_WINDOW_MS', defaultAttachmentRateLimits.windowMs, 2_147_483_647),
      globalLimit: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_GLOBAL_REQUESTS', defaultAttachmentRateLimits.globalLimit),
      userLimit: positiveInteger(env, 'ATTACHMENT_RATE_LIMIT_USER_REQUESTS', defaultAttachmentRateLimits.userLimit),
    },
    storage: storageConfig(env),
    supabaseUrl: required(env, 'SUPABASE_URL', 'VITE_SUPABASE_URL'),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  };
}
