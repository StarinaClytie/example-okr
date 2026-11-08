// @vitest-environment node
import { createServer, type IncomingMessage } from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createS3ObjectStore } from './s3';

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
// Independent SigV4 verification: omitting/changing a signed header must fail.
function validSignature(req: IncomingMessage, url: URL): boolean {
  const credential = url.searchParams.get('X-Amz-Credential')?.split('/') ?? [];
  const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
  if (credential.length !== 5 || credential[0] !== 'test-access' || !signed) return false;
  const query = [...url.searchParams.entries()].filter(([key]) => key !== 'X-Amz-Signature')
    .map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('&');
  const headers = signed.split(';').map(name => `${name}:${String(req.headers[name] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const payload = url.searchParams.get('X-Amz-Content-Sha256') ?? 'UNSIGNED-PAYLOAD';
  const canonical = [req.method, url.pathname, query, headers, signed, payload].join('\n');
  const scope = credential.slice(1).join('/');
  const toSign = ['AWS4-HMAC-SHA256', url.searchParams.get('X-Amz-Date'), scope, hash(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4test-secret', credential[1]), credential[2]), 's3'), 'aws4_request');
  return createHmac('sha256', key).update(toSign).digest('hex') === url.searchParams.get('X-Amz-Signature');
}

it('round-trips authorized S3 attachments over HTTP and rejects header tampering and overwrites', async () => {
  const files = new Map<string, { bytes: Buffer; mime: string; etag: string }>();
  const storage = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    if (url.searchParams.has('versioning')) {
      res.setHeader('Content-Type', 'application/xml');
      res.end('<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>'); return;
    }
    if (url.searchParams.has('X-Amz-Signature') && !validSignature(req, url)) { res.statusCode = 403; res.end(); return; }
    if (req.method === 'PUT') {
      if (req.headers['if-none-match'] !== '*') { res.statusCode = 403; res.end(); return; }
      if (files.has(url.pathname)) { res.statusCode = 412; res.end(); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      files.set(url.pathname, { bytes, mime: String(req.headers['content-type']), etag: createHash('md5').update(bytes).digest('hex') });
      res.statusCode = 200; res.end(); return;
    }
    if (req.method === 'DELETE') { files.delete(url.pathname); res.statusCode = 204; res.end(); return; }
    const file = files.get(url.pathname);
    if (!file) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.mime); res.setHeader('Content-Length', file.bytes.length); res.setHeader('ETag', `"${file.etag}"`);
    res.end(req.method === 'HEAD' ? undefined : file.bytes);
  });
  storage.listen(0, '127.0.0.1'); await once(storage, 'listening');
  const address = storage.address() as { port: number };
  try {
    // HTTP is used only by this loopback fixture; the environment loader requires HTTPS.
    const store = createS3ObjectStore({ provider: 's3', accessKeyId: 'test-access', secretAccessKey: 'test-secret', bucket: 'private-attachments', region: 'eu-west-2', endpoint: `http://127.0.0.1:${address.port}`, forcePathStyle: true });
    const confirmUpload = vi.fn(async () => ({ ok: true }));
    const confirmDeletion = vi.fn(async () => ({ ok: true }));
    const app = createApp({ store, authenticate: async () => ({ token: 'test', userId: 'test-user' }), authorize: async (_token, _operation, id) => ({ ok: true, data: { id, path: id, mimeType: 'text/plain', byteSize: 4 } }), confirmUpload, confirmDeletion });
    for (const family of ['attachments', 'resource-attachments']) {
      const signed = (await request(app).post(`/api/${family}/${family}/upload-url`)).body;
      expect(signed.headers).toEqual({ 'If-None-Match': '*' });
      expect((await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'data' })).status).toBe(403);
      expect((await fetch(signed.url, { method: 'PUT', headers: { ...signed.headers, 'Content-Type': 'application/json' }, body: 'data' })).status).toBe(403);
      const put = { method: 'PUT', headers: { ...signed.headers, 'Content-Type': signed.contentType }, body: 'data' };
      expect((await fetch(signed.url, put)).status).toBe(200);
      expect((await fetch(signed.url, { ...put, body: 'evil' })).status).toBe(412);
      expect((await request(app).post(`/api/${family}/${family}/finalize`)).status).toBe(200);
      const download = (await request(app).get(`/api/${family}/${family}/download-url`)).body;
      expect(await (await fetch(download.url)).text()).toBe('data');
      expect((await request(app).delete(`/api/${family}/${family}`)).status).toBe(204);
      expect((await fetch(download.url)).status).toBe(404);
    }
    expect(confirmUpload).toHaveBeenCalledTimes(2); expect(confirmDeletion).toHaveBeenCalledTimes(2); expect(files.size).toBe(0);
  } finally {
    storage.closeAllConnections(); await new Promise<void>((resolve, reject) => storage.close(error => error ? reject(error) : resolve()));
  }
}, 15000);
