// Provider-agnostic transactional email sender.
//
// The Resources & Supplies module must not be permanently tied to one email
// provider. Business logic depends only on `sendTransactionalEmail`; the
// provider-specific implementation is isolated here. Today only Resend is
// supported and it is gated on RESEND_API_KEY — with no provider configured,
// `sendTransactionalEmail` returns `email_not_configured` so the notification
// audit trail can record a traceable, retryable failure instead of dropping the
// message silently.
//
// When a production provider is chosen (SMTP, Aliyun DirectMail, ...), add a
// provider branch here without touching callers. Nothing in the frontend or the
// domain model references a provider.

export interface TransactionalEmail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export type SendEmailErrorCode =
  | 'email_not_configured'
  | 'provider_unreachable'
  | 'provider_error';

export type SendEmailResult =
  | { ok: true }
  | { ok: false; code: SendEmailErrorCode };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
// Pure configuration validation: no addresses or secrets are exposed on failure.
export function resourceEmailConfig(get: (key: string) => string | undefined) {
  const apiKey = get('RESEND_API_KEY')?.trim();
  const from = get('RESEND_FROM_EMAIL')?.trim();
  const appUrl = get('RESOURCE_APP_URL')?.trim();
  if (!apiKey || !from || !appUrl) return null;
  try {
    const parsed = new URL(appUrl);
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) return null;
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return { apiKey, from, appUrl: parsed.origin };
  } catch {
    return null;
  }
}

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<SendEmailResult> {
  const config = resourceEmailConfig((key) => Deno.env.get(key));
  if (!config) {
    return { ok: false, code: 'email_not_configured' };
  }

  const { apiKey, from } = config;
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });
    if (!response.ok) {
      return { ok: false, code: 'provider_error' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'provider_unreachable' };
  }
}
