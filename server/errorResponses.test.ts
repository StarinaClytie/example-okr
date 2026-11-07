// @vitest-environment node
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type AttachmentApiDependencies } from './app';

function dependencies(): AttachmentApiDependencies {
  return {
    authenticate: vi.fn(async () => ({ token: 'valid', userId: 'user-1' })),
    authorize: vi.fn(async () => ({ ok: true, data: { id: 'file', path: 'private/object.pdf', mimeType: 'application/pdf', byteSize: 4 } })),
    confirmUpload: vi.fn(async () => ({ ok: true })),
    confirmDeletion: vi.fn(async () => ({ ok: true })),
    oss: { signPut: vi.fn(async () => 'https://oss.example/upload?Signature=private-signature'), signGet: vi.fn(async () => 'https://oss.example/download?Signature=private-signature'), head: vi.fn(async () => ({ byteSize: 4, mimeType: 'application/pdf', etag: 'etag' })), delete: vi.fn(async () => {}) },
  };
}

describe('safe attachment responses', () => {
  it.each(['/api/attachments', '/api/resource-attachments'])('returns safe JSON for malformed and oversized bodies on %s', async (base) => {
    const deps = dependencies();
    const app = createApp(deps);
    app.set('env', 'development');
    const malformed = await request(app).post(`${base}/file/upload-url`).set('Content-Type', 'application/json').send('{"private-marker":');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'Invalid request' });
    expect(malformed.headers['content-type']).toMatch(/application\/json/);
    expect(malformed.text).not.toMatch(/private-marker|SyntaxError|node_modules/);
    const oversized = await request(app).post(`${base}/file/upload-url`).send({ value: 'private-marker'.repeat(2000) });
    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ error: 'Request body too large' });
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.oss.signPut).not.toHaveBeenCalled();
  });

  it('returns generic JSON for unsupported encoding, invalid paths and unknown endpoints', async () => {
    const app = createApp(dependencies());
    const encoded = await request(app).post('/api/attachments/file/upload-url').set('Content-Type', 'application/json').set('Content-Encoding', 'unknown-private-encoding').send('{}');
    expect(encoded.status).toBe(415);
    expect(encoded.body).toEqual({ error: 'Unsupported request encoding' });
    const malformedPath = await request(app).get('/api/attachments/%E0%A4%A/download-url');
    expect(malformedPath.status).toBe(400);
    expect(malformedPath.body).toEqual({ error: 'Invalid request' });
    const missing = await request(app).get('/unknown-private-path');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Not found' });
  });

  it('does not forward database authorization error details', async () => {
    const deps = dependencies();
    deps.authorize = vi.fn(async () => ({ ok: false, status: 403, message: 'private SQL relation and user details' }));
    const reply = await request(createApp(deps)).get('/api/attachments/file/download-url');
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({ error: 'Forbidden' });
    expect(deps.oss.signGet).not.toHaveBeenCalled();
  });

  it('sanitizes confirmation failures and rejects success-shaped failure statuses', async () => {
    const deps = dependencies();
    deps.confirmUpload = vi.fn(async () => ({ ok: false, status: 200, message: 'private SQL state' }));
    const app = createApp(deps);
    const finalized = await request(app).post('/api/attachments/file/finalize');
    expect(finalized.status).toBe(500);
    expect(finalized.body).toEqual({ error: 'Finalization failed' });
    deps.confirmDeletion = vi.fn(async () => ({ ok: false, status: 503, message: 'private database address' }));
    const removed = await request(app).delete('/api/resource-attachments/file');
    expect(removed.status).toBe(503);
    expect(removed.body).toEqual({ error: 'Deletion confirmation failed' });
  });

  it('fails closed with JSON if downstream middleware throws', async () => {
    const deps = dependencies();
    deps.authenticate = vi.fn(async () => ({ token: 'valid', get userId(): string { throw new Error('private backend detail'); } }));
    const reply = await request(createApp(deps)).get('/api/attachments/file/download-url');
    expect(reply.status).toBe(500);
    expect(reply.body).toEqual({ error: 'Internal server error' });
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it.each(['upload', 'download'])('prevents caching and content sniffing of signed %s URL responses', async (operation) => {
    const app = createApp(dependencies());
    const reply = operation === 'upload' ? await request(app).post('/api/attachments/file/upload-url') : await request(app).get('/api/resource-attachments/file/download-url');
    expect(reply.status).toBe(200);
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
  });
});
