import { DeleteObjectCommand, GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { S3StorageConfig } from './config.js';
import type { ObjectStore } from './types.js';

export function createS3ObjectStore(config: S3StorageConfig): ObjectStore {
  // Only the official R2 service may bypass the unsupported versioning API.
  if (config.provider === 'r2') {
    let endpoint: URL;
    try { endpoint = new URL(config.endpoint ?? ''); } catch { throw new Error('Invalid R2 endpoint'); }
    if (config.region !== 'auto' || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash || endpoint.pathname !== '/' || !/^[a-f0-9]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)) {
      throw new Error('Invalid R2 endpoint or region');
    }
  }
  const client = new S3Client({
    region: config.region, endpoint: config.endpoint, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken },
    // Do not sign an optional checksum of the SDK's empty placeholder body.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  async function requireNeverVersionedBucket() {
    if (config.provider === 'r2') return;
    const result = await client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }));
    if (result.Status !== undefined) throw new Error('Attachment storage requires a never-versioned S3 bucket');
  }
  return {
    async signPut(path, contentType, expiresIn) {
      await requireNeverVersionedBucket();
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: config.bucket, Key: path, ContentType: contentType, IfNoneMatch: '*' }), {
        expiresIn, signableHeaders: new Set(['content-type', 'if-none-match']),
      });
      return { url, headers: { 'If-None-Match': '*' } };
    },
    async head(path) {
      await requireNeverVersionedBucket();
      const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: path }));
      return { byteSize: Number(result.ContentLength), mimeType: result.ContentType ?? '', etag: (result.ETag ?? '').replace(/^"|"$/g, '') };
    },
    async signGet(path, expiresIn, filename) {
      await requireNeverVersionedBucket();
      const encoded = filename ? encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`) : undefined;
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: path, ...(encoded ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encoded}` } : {}) }), { expiresIn });
    },
    async delete(path) {
      await requireNeverVersionedBucket();
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: path }));
    },
  };
}
