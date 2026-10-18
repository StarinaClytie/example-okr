import { afterEach, describe, expect, it, vi } from 'vitest';

// Load the edge transport only in this test; the browser app never imports Deno code.
const transportPath = '../../supabase/functions/_shared/email.ts';
const { sendTransactionalEmail } = await import(transportPath);

afterEach(() => vi.unstubAllGlobals());

function configure(values: Record<string, string>) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => values[key] } });
  const request = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', request);
  return request;
}

const message = { to: 'owner@example.com', subject: 'Resource issue', text: 'Details' };
const valid = { RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'Example OKR <notify@example.com>', RESOURCE_APP_URL: 'https://app.example.com' };

describe('transactional email configuration', () => {
  it.each(['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESOURCE_APP_URL'])('refuses delivery when %s is missing', async (key) => {
    const values = { ...valid };
    delete values[key as keyof typeof values];
    const request = configure(values);
    expect(await sendTransactionalEmail(message)).toEqual({ ok: false, code: 'email_not_configured' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'javascript:alert(1)', 'https://private-user:secret@app.example.com', 'not-a-url', 'http://app.example.com', 'https://app.example.com?x=1', 'https://app.example.com#fragment', 'https://app.example.com/nested'])('refuses an invalid application URL without disclosing configuration', async (url) => {
    const request = configure({ ...valid, RESOURCE_APP_URL: url });
    expect(await sendTransactionalEmail(message)).toEqual({ ok: false, code: 'email_not_configured' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://app.example.com/'])('accepts an explicit development or HTTPS origin: %s', async (url) => {
    configure({ ...valid, RESOURCE_APP_URL: url });
    expect(await sendTransactionalEmail(message)).toEqual({ ok: true });
  });

  it('uses the explicitly configured sender', async () => {
    const request = configure(valid);
    expect(await sendTransactionalEmail(message)).toEqual({ ok: true });
    expect(JSON.parse(request.mock.calls[0][1].body as string).from).toBe(valid.RESEND_FROM_EMAIL);
  });
});
