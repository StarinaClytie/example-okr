// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteObjectCommand, GetBucketVersioningCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createS3ObjectStore } from './s3.js';
import type { S3StorageConfig } from './config.js';

const config: S3StorageConfig = { provider: 's3', accessKeyId: 'test-access', secretAccessKey: 'test-secret', sessionToken: 'temporary-token', bucket: 'private-attachments', region: 'eu-west-2', forcePathStyle: false };
const r2: S3StorageConfig = { ...config, provider: 'r2', region: 'auto', endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com', forcePathStyle: true };
afterEach(() => vi.restoreAllMocks());

describe('S3-compatible object store', () => {
  it.each([config, r2])('uses real SigV4 to bind PUT content type and atomic creation for $provider', async (settings) => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const signed = await createS3ObjectStore(settings).signPut('attachments/a b.txt', 'text/plain', 123);
    const url = new URL(signed.url);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(expect.arrayContaining(['content-type', 'host', 'if-none-match']));
    expect(signed.headers['If-None-Match']).toBe('*');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('123');
    expect(url.searchParams.get('X-Amz-Credential')).toContain(`/${settings.region}/s3/aws4_request`);
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe('temporary-token');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect([...url.searchParams.keys()].join(' ').toLowerCase()).not.toContain('checksum');
    expect(url.hostname).toBe(settings.provider === 's3' ? 'private-attachments.s3.eu-west-2.amazonaws.com' : new URL(settings.endpoint!).hostname);
    expect(send).toHaveBeenCalledTimes(settings.provider === 's3' ? 1 : 0);
    if (settings.provider === 's3') expect(send.mock.calls[0][0]).toBeInstanceOf(GetBucketVersioningCommand);
  });
  it('signs GET expiry and safely encoded Unicode download filenames', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const url = new URL(await createS3ObjectStore(config).signGet('a', 87, "报告'()*\r\n.txt"));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('87');
    expect(url.searchParams.get('response-content-disposition')).toBe("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A%27%28%29%2A%0D%0A.txt");
  });
  it('maps HEAD metadata and awaits DeleteObject after version checks', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => command instanceof HeadObjectCommand ? { ContentLength: 42, ContentType: 'text/plain', ETag: '"abc"' } : {});
    const store = createS3ObjectStore(config);
    expect(await store.head('a')).toEqual({ byteSize: 42, mimeType: 'text/plain', etag: 'abc' });
    await store.delete('a');
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['GetBucketVersioningCommand', 'HeadObjectCommand', 'GetBucketVersioningCommand', 'DeleteObjectCommand']);
    expect((send.mock.calls[3][0] as DeleteObjectCommand).input).toEqual({ Bucket: config.bucket, Key: 'a' });
  });
  it.each(['Enabled', 'Suspended', 'unexpected'])('fails every operation closed for version status %s', async (Status) => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Status } as never);
    const store = createS3ObjectStore(config);
    for (const operation of [() => store.signPut('a', 'text/plain', 60), () => store.head('a'), () => store.signGet('a', 60), () => store.delete('a')]) await expect(operation()).rejects.toThrow(/never-versioned/);
    expect(send.mock.calls.every(([command]) => command instanceof GetBucketVersioningCommand)).toBe(true);
  });
  it('fails closed if versioning cannot be checked and propagates delete failure', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('denied'));
    await expect(createS3ObjectStore(config).signPut('a', 'text/plain', 60)).rejects.toThrow('denied');
    send.mockImplementation(async (command) => { if (command instanceof DeleteObjectCommand) throw new Error('delete failed'); return {}; });
    await expect(createS3ObjectStore(config).delete('a')).rejects.toThrow('delete failed');
  });
  it.each(['https://example.com', 'http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com', `${r2.endpoint}/path`, `${r2.endpoint}?x=1`, `https://user@${new URL(r2.endpoint!).hostname}`])('rejects invalid R2 endpoint %s at the exported factory boundary', (endpoint) => {
    expect(() => createS3ObjectStore({ ...r2, endpoint })).toThrow(/R2/);
  });
  it.each(['eu', 'us', 'fedramp'])('supports official %s R2 jurisdiction endpoint', async (jurisdiction) => {
    const endpoint = r2.endpoint!.replace('.r2.', `.${jurisdiction}.r2.`);
    const signed = await createS3ObjectStore({ ...r2, endpoint }).signPut('a', 'text/plain', 60);
    expect(new URL(signed.url).hostname).toBe(new URL(endpoint).hostname);
  });
  it('rejects R2 region other than auto', () => { expect(() => createS3ObjectStore({ ...r2, region: 'us-east-1' })).toThrow(/R2/); });
});
