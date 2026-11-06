import OSS from 'ali-oss';
import type { ServerConfig } from './config.js';
import type { OssObjectStore } from './types.js';

export function createOssObjectStore(config: ServerConfig): OssObjectStore {
  const client = new OSS({
    accessKeyId: config.ossAccessKeyId,
    accessKeySecret: config.ossAccessKeySecret,
    bucket: config.ossBucket,
    region: config.ossRegion,
    endpoint: config.ossEndpoint,
    secure: true,
  });
  // Forbid-overwrite is ignored on enabled AND suspended versioned buckets.
  // Check without caching: a permission/network failure must fail closed.
  async function requireNeverVersionedBucket() {
    const result = await (client as OSS & {
      getBucketVersioning(bucket: string): Promise<{ status: number; versionStatus?: string }>;
    }).getBucketVersioning(config.ossBucket);
    if (result.status !== 200 || (result.versionStatus !== undefined && result.versionStatus !== '')) {
      throw new Error('Attachment storage requires a never-versioned OSS bucket');
    }
  }
  return {
    async signPut(path, contentType, expiresIn) {
      await requireNeverVersionedBucket();
      const options = { method: 'PUT' as const, expires: expiresIn, 'Content-Type': contentType, 'x-oss-forbid-overwrite': 'true' };
      return client.signatureUrl(path, options);
    },
    async head(path) {
      await requireNeverVersionedBucket();
      const result = await client.head(path);
      const headers = result.res.headers as Record<string, string | number | undefined>;
      return {
        byteSize: Number(headers['content-length']),
        mimeType: String(headers['content-type'] || ''),
        etag: String(headers.etag || '').replace(/^"|"$/g, ''),
      };
    },
    async signGet(path, expiresIn, filename) {
      await requireNeverVersionedBucket();
      const disposition = filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : undefined;
      return client.signatureUrl(path, {
        method: 'GET', expires: expiresIn,
        ...(disposition ? { response: { 'content-disposition': disposition } } : {}),
      });
    },
    async delete(path) { await client.delete(path); },
  };
}
