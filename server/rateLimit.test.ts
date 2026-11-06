// @vitest-environment node
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AttachmentApiDependencies } from './app';

function dependencies(): AttachmentApiDependencies {
  return {
    authenticate: vi.fn(async (header) => {
      const token = header?.replace('Bearer ', '');
      if (!token || token === 'invalid') return null;
      return { token, userId: token === 'a-rotated' ? 'a' : token };
    }),
    authorize: vi.fn(async () => ({ ok: true, data: { id: 'file', path: 'files/file.pdf', mimeType: 'application/pdf', byteSize: 4 } })),
    confirmUpload: vi.fn(async () => ({ ok: true })),
    confirmDeletion: vi.fn(async () => ({ ok: true })),
    oss: { signPut: vi.fn(async () => 'https://oss.example/upload'), signGet: vi.fn(async () => 'https://oss.example/download'), head: vi.fn(async () => ({ byteSize: 4, mimeType: 'application/pdf', etag: 'etag' })), delete: vi.fn(async () => {}) },
  };
}
afterEach(() => vi.useRealTimers());

describe('attachment request budgets', () => {
  it('shares a verified user budget across tokens and both attachment families, then resets', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const deps = dependencies();
    const app = createApp(deps, { windowMs: 60_000, globalLimit: 20, userLimit: 2 });
    expect((await request(app).post('/api/attachments/file/upload-url').set('Authorization', 'Bearer a')).status).toBe(200);
    expect((await request(app).get('/api/resource-attachments/file/download-url').set('Authorization', 'Bearer a-rotated')).status).toBe(200);
    const blocked = await request(app).delete('/api/attachments/file').set('Authorization', 'Bearer a').set('X-Forwarded-For', '203.0.113.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(deps.authorize).toHaveBeenCalledTimes(2);
    expect(deps.oss.delete).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 60_001);
    expect((await request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a')).status).toBe(200);
  });

  it('keeps different verified users independent behind the same proxy', async () => {
    const app = createApp(dependencies(), { windowMs: 60_000, globalLimit: 20, userLimit: 1 });
    expect((await request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a')).status).toBe(200);
    expect((await request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a').set('X-Forwarded-For', '198.51.100.2')).status).toBe(429);
    expect((await request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer b')).status).toBe(200);
    expect(app.get('trust proxy')).toBe(false);
  });

  it('limits unauthenticated traffic before any upstream identity call and leaves health checks available', async () => {
    const deps = dependencies();
    const app = createApp(deps, { windowMs: 60_000, globalLimit: 2, userLimit: 10 });
    expect((await request(app).get('/api/attachments/file/download-url')).status).toBe(401);
    expect((await request(app).post('/api/resource-attachments/file/upload-url').set('Authorization', 'Bearer invalid')).status).toBe(401);
    const blocked = await request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a').set('X-Forwarded-For', '198.51.100.3');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many attachment requests' });
    expect(deps.authenticate).toHaveBeenCalledTimes(2);
    expect(deps.authorize).not.toHaveBeenCalled();
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('reserves the user quota atomically under concurrent requests', async () => {
    const deps = dependencies();
    const app = createApp(deps, { windowMs: 60_000, globalLimit: 20, userLimit: 1 });
    const replies = await Promise.all(Array.from({ length: 3 }, () => request(app).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a')));
    expect(replies.map(r => r.status).sort()).toEqual([200, 429, 429]);
    expect(deps.oss.signGet).toHaveBeenCalledTimes(1);
  });
});

it('fails closed when identity verification throws without exposing backend details', async () => {
  const deps = dependencies();
  deps.authenticate = vi.fn(async () => { throw new Error('private upstream details'); });
  const response = await request(createApp(deps)).get('/api/attachments/file/download-url').set('Authorization', 'Bearer a');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'Authentication unavailable' });
  expect(deps.authorize).not.toHaveBeenCalled();
  expect(deps.oss.signGet).not.toHaveBeenCalled();
});
