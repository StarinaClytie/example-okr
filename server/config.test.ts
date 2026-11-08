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
    expect(loadServerConfig(valid)).toMatchObject({ host: '127.0.0.1', port: 3001, storage: { provider: 'oss', bucket: 'example-okr-files' } });
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

const common = { SUPABASE_URL: 'https://api.example.test', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
const s3 = { ...common, ATTACHMENT_STORAGE_PROVIDER: 's3', S3_ACCESS_KEY_ID: 'test-access', S3_SECRET_ACCESS_KEY: 'test-secret', S3_BUCKET: 'example-files', S3_REGION: 'eu-west-2' };
it('loads only S3 credentials when S3 is selected', () => {
  expect(loadServerConfig(s3)).toMatchObject({ storage: { provider: 's3', bucket: 'example-files', region: 'eu-west-2', forcePathStyle: false } });
});
it('loads R2 with auto region and its official account endpoint', () => {
  expect(loadServerConfig({ ...s3, ATTACHMENT_STORAGE_PROVIDER: 'r2', S3_REGION: 'auto', S3_ENDPOINT: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com' })).toMatchObject({ storage: { provider: 'r2', region: 'auto', forcePathStyle: true } });
});
it.each(['', 'https://s3.amazonaws.com', 'https://files.example.com', 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com.evil.test', 'https://user:secret@0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com'])('rejects unsafe or non-R2 endpoint %s', (endpoint) => {
  expect(() => loadServerConfig({ ...s3, ATTACHMENT_STORAGE_PROVIDER: 'r2', S3_REGION: 'auto', S3_ENDPOINT: endpoint })).toThrow('S3_ENDPOINT');
});
it.each(['http://example.test', 'https://example.test/path', 'https://example.test/?token=secret', 'https://example.test/#fragment'])('rejects unsafe S3 endpoints without exposing their contents', (endpoint) => {
  try { loadServerConfig({ ...s3, S3_ENDPOINT: endpoint }); throw new Error('accepted'); }
  catch (error) { expect(String(error)).toContain('S3_ENDPOINT'); expect(String(error)).not.toContain(endpoint); }
});
it.each(['azure', 'S3'])('rejects an unknown storage provider %s', (provider) => {
  expect(() => loadServerConfig({ ...valid, ATTACHMENT_STORAGE_PROVIDER: provider })).toThrow('ATTACHMENT_STORAGE_PROVIDER');
});
it('rejects invalid booleans and non-auto R2 regions', () => {
  expect(() => loadServerConfig({ ...s3, S3_FORCE_PATH_STYLE: 'yes' })).toThrow('S3_FORCE_PATH_STYLE');
  expect(() => loadServerConfig({ ...s3, ATTACHMENT_STORAGE_PROVIDER: 'r2', S3_ENDPOINT: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com' })).toThrow('S3_REGION');
});

it('keeps a legacy bare OSS service endpoint working over HTTPS', () => {
  expect(loadServerConfig({...valid, OSS_ENDPOINT: 'oss-cn-shanghai.aliyuncs.com'})).toMatchObject({storage:{endpoint:'https://oss-cn-shanghai.aliyuncs.com'}});
});

it('accepts the documented US jurisdiction R2 endpoint', () => {
 expect(loadServerConfig({...s3,ATTACHMENT_STORAGE_PROVIDER:'r2',S3_REGION:'auto',S3_ENDPOINT:'https://0123456789abcdef0123456789abcdef.us.r2.cloudflarestorage.com'})).toMatchObject({storage:{provider:'r2'}});
});
