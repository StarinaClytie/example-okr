import { rateLimit } from 'express-rate-limit';

export interface AttachmentRateLimitConfig {
  windowMs: number;
  globalLimit: number;
  userLimit: number;
}

export const defaultAttachmentRateLimits: AttachmentRateLimitConfig = {
  windowMs: 60_000,
  globalLimit: 6000,
  userLimit: 120,
};

export function attachmentRateLimiters(config: AttachmentRateLimitConfig) {
  const common = {
    windowMs: config.windowMs,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    message: { error: 'Too many attachment requests' },
  };
  return {
    // Deliberately process-wide, independent of untrusted forwarding headers.
    // This bounds identity-provider calls even before an identity is available.
    admission: rateLimit({ ...common, limit: config.globalLimit, identifier: 'attachment-admission', keyGenerator: () => 'attachment-api' }),
    verifiedUser: rateLimit({
      ...common,
      limit: config.userLimit,
      identifier: 'attachment-user',
      keyGenerator: (_req, res) => res.locals.attachmentCaller.userId as string,
    }),
  };
}
