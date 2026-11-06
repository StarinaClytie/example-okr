// @vitest-environment node
import OSS from 'ali-oss';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOssObjectStore } from './oss';
import { loadServerConfig } from './config';

const config = loadServerConfig({ OSS_ACCESS_KEY_ID: 'test-id', OSS_ACCESS_KEY_SECRET: 'test-secret', OSS_BUCKET: 'test-bucket', OSS_REGION: 'oss-cn-shanghai', OSS_ENDPOINT: 'https://oss-cn-shanghai.aliyuncs.com', SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' });
// ali-oss implements this API but its DefinitelyTyped declarations omit it.
const prototype = OSS.prototype as unknown as { getBucketVersioning(bucket: string): Promise<{ status: number; versionStatus?: string }> };
afterEach(() => vi.restoreAllMocks());
describe('OSS immutable uploads', () => {
  it('cryptographically binds forbid-overwrite into the actual signed PUT', async () => {
    vi.spyOn(prototype, 'getBucketVersioning').mockResolvedValue({ status: 200 });
    const url = new URL(await createOssObjectStore(config).signPut('evidence.pdf', 'application/pdf', 300));
    const canonical = `PUT\n\napplication/pdf\n${url.searchParams.get('Expires')}\nx-oss-forbid-overwrite:true\n/test-bucket/evidence.pdf`;
    expect(url.searchParams.get('Signature')).toBe(createHmac('sha1', 'test-secret').update(canonical).digest('base64'));
  });
  it.each(['Enabled', 'Suspended', 'unexpected'])('refuses uploads and verification/downloads for bucket version state %s', async (versionStatus) => {
    vi.spyOn(prototype, 'getBucketVersioning').mockResolvedValue({ status: 200, versionStatus });
    const store = createOssObjectStore(config);
    await expect(store.signPut('evidence.pdf', 'application/pdf', 300)).rejects.toThrow('never-versioned');
    await expect(store.head('evidence.pdf')).rejects.toThrow('never-versioned');
    await expect(store.signGet('evidence.pdf', 60)).rejects.toThrow('never-versioned');
  });
  it('fails closed when bucket versioning cannot be checked', async () => {
    vi.spyOn(prototype, 'getBucketVersioning').mockRejectedValue(new Error('AccessDenied'));
    await expect(createOssObjectStore(config).signPut('evidence.pdf', 'application/pdf', 300)).rejects.toThrow('AccessDenied');
  });
});
