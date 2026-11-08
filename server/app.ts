import { attachmentRateLimiters, defaultAttachmentRateLimits, type AttachmentRateLimitConfig } from './rateLimit.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { AttachmentKind, AttachmentOperation, AuthorizedAttachment, ObjectStore, RpcResult } from './types.js';

export interface AttachmentApiDependencies {
  authenticate(header: string | undefined): Promise<{ token: string; userId: string } | null>;
  authorize(token: string, operation: AttachmentOperation, attachmentId: string, kind: AttachmentKind): Promise<RpcResult<AuthorizedAttachment>>;
  confirmUpload(id: string, checksum: string, mimeType: string, byteSize: number, kind: AttachmentKind): Promise<RpcResult<void>>;
  confirmDeletion(id: string, kind: AttachmentKind): Promise<RpcResult<void>>;
  store: ObjectStore;
}

function attachmentId(req: Request): string { return String(req.params.attachmentId || ''); }

function failureStatus(status: number | undefined, fallback: number): number {
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}

export function createApp(deps: AttachmentApiDependencies, rateLimits: AttachmentRateLimitConfig = defaultAttachmentRateLimits) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  const limits = attachmentRateLimiters(rateLimits);
  app.use(['/api/attachments', '/api/resource-attachments'], limits.admission, async (req, res, next) => {
    try {
      const caller = await deps.authenticate(req.header('authorization'));
      if (!caller) { res.status(401).json({ error: 'Unauthorized' }); return; }
      res.locals.attachmentCaller = caller;
      next();
    } catch {
      res.status(503).json({ error: 'Authentication unavailable' });
    }
  }, limits.verifiedUser, express.json({ limit: '16kb' }));

  async function context(req: Request, res: Response, operation: AttachmentOperation, kind: AttachmentKind) {
    const caller = res.locals.attachmentCaller as { token: string; userId: string };
    const authorized = await deps.authorize(caller.token, operation, attachmentId(req), kind);
    if (!authorized.ok || !authorized.data) {
      const status = failureStatus(authorized.status, 403);
      const message = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden'
        : status === 404 ? 'Attachment not found' : status === 400 ? 'Invalid attachment request' : 'Attachment authorization failed';
      res.status(status).json({ error: message });
      return null;
    }
    return authorized.data;
  }

  function registerAttachmentRoutes(basePath: string, kind: AttachmentKind) {
    app.post(`${basePath}/:attachmentId/upload-url`, async (req, res) => {
      try {
        const target = await context(req, res, 'upload', kind); if (!target) return;
        const expiresIn = 300;
        const upload = await deps.store.signPut(target.path, target.mimeType, expiresIn);
        res.json({ url: upload.url, method: 'PUT', contentType: target.mimeType, headers: upload.headers, expiresIn });
      } catch { res.status(502).json({ error: 'Storage signing failed' }); }
    });

    app.post(`${basePath}/:attachmentId/finalize`, async (req, res) => {
      try {
        const target = await context(req, res, 'upload', kind); if (!target) return;
        const object = await deps.store.head(target.path);
        if (!Number.isSafeInteger(object.byteSize) || object.byteSize !== target.byteSize || object.mimeType !== target.mimeType || !object.etag.trim()) {
          res.status(422).json({ error: 'Uploaded object metadata mismatch' }); return;
        }
        const confirmed = await deps.confirmUpload(target.id, object.etag, target.mimeType, target.byteSize, kind);
        if (!confirmed.ok) { res.status(failureStatus(confirmed.status, 500)).json({ error: 'Finalization failed' }); return; }
        res.json({ id: target.id, state: 'uploaded' });
      } catch { res.status(502).json({ error: 'Storage verification failed' }); }
    });

    app.get(`${basePath}/:attachmentId/download-url`, async (req, res) => {
      try {
        const target = await context(req, res, 'download', kind); if (!target) return;
        const expiresIn = target.expiresIn || 60;
        const url = await deps.store.signGet(target.path, expiresIn, target.originalName ?? target.fileName);
        res.json({ url, expiresIn });
      } catch { res.status(502).json({ error: 'Storage signing failed' }); }
    });

    app.delete(`${basePath}/:attachmentId`, async (req, res) => {
      try {
        const target = await context(req, res, 'delete', kind); if (!target) return;
        if (!target.alreadyDeleted) await deps.store.delete(target.path);
        const confirmed = await deps.confirmDeletion(target.id, kind);
        if (!confirmed.ok) { res.status(failureStatus(confirmed.status, 500)).json({ error: 'Deletion confirmation failed' }); return; }
        res.status(204).end();
      } catch { res.status(502).json({ error: 'Storage deletion failed' }); }
    });
  }

  registerAttachmentRoutes('/api/attachments', 'daily');
  registerAttachmentRoutes('/api/resource-attachments', 'resource');
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  // Express otherwise emits HTML (and development stack traces) for parser,
  // route-decoding and middleware errors. Never serialize an upstream error.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) { next(error); return; }
    const suppliedStatus = error && typeof error === 'object' ? (error as { status?: unknown }).status : undefined;
    const status = typeof suppliedStatus === 'number' && Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus < 500 ? suppliedStatus : 500;
    const message = status === 413 ? 'Request body too large' : status === 415 ? 'Unsupported request encoding'
      : status < 500 ? 'Invalid request' : 'Internal server error';
    res.status(status).json({ error: message });
  });
  return app;
}
