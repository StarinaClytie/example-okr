// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config';

const valid = {
  OSS_ACCESS_KEY_ID: 'test-id', OSS_ACCESS_KEY_SECRET: 'test-secret',
  OSS_BUCKET: 'example-okr-files', OSS_REGION: 'oss-cn-shanghai',
  OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com',
  SUPABASE_URL: 'https://api.example.test', SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
};

describe('loadServerConfig', () => {
  it('loads server-only runtime variables and binds localhost by default', () => {
    expect(loadServerConfig(valid)).toMatchObject({ host: '127.0.0.1', port: 3001, ossBucket: 'example-okr-files' });
  });
  it('fails with variable names but never secret values', () => {
    expect(() => loadServerConfig({ ...valid, OSS_ACCESS_KEY_SECRET: '' })).toThrow('OSS_ACCESS_KEY_SECRET');
    try { loadServerConfig({ ...valid, OSS_ACCESS_KEY_SECRET: '' }); } catch (error) {
      expect(String(error)).not.toContain('test-secret');
    }
  });
});

it('defaults to bounded admission and verified-user request quotas', () => {
  expect(loadServerConfig(valid)).toMatchObject({ rateLimit: { windowMs: 60_000, globalLimit: 6000, userLimit: 120 } });
});
it.each([
  ['ATTACHMENT_RATE_LIMIT_WINDOW_MS', '0'],
  ['ATTACHMENT_RATE_LIMIT_WINDOW_MS', '2147483648'],
  ['ATTACHMENT_RATE_LIMIT_GLOBAL_REQUESTS', '-1'],
  ['ATTACHMENT_RATE_LIMIT_USER_REQUESTS', '1.5'],
  ['ATTACHMENT_RATE_LIMIT_USER_REQUESTS', 'invalid'],
])('rejects invalid quota %s', (name, value) => {
  expect(() => loadServerConfig({ ...valid, [name]: value })).toThrow(name);
});
it('loads explicit quota configuration', () => {
  expect(loadServerConfig({ ...valid, ATTACHMENT_RATE_LIMIT_WINDOW_MS: '1000', ATTACHMENT_RATE_LIMIT_GLOBAL_REQUESTS: '500', ATTACHMENT_RATE_LIMIT_USER_REQUESTS: '10' }).rateLimit)
    .toEqual({ windowMs: 1000, globalLimit: 500, userLimit: 10 });
});
