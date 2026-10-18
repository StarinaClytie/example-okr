# Auth email templates

Hosted Supabase uses Dashboard SMTP and email-template configuration. Self-hosted GoTrue uses distribution-specific settings and must be verified against that distribution. Templates in `public/email/` are reusable assets, not evidence that a mail service is configured. Auth mail is separate from resource notifications; the latter require both `RESEND_FROM_EMAIL` and `RESOURCE_APP_URL` explicitly, as well as the provider key.

See the [canonical installation guide](supabase-setup.md) for maintained steps and the [verification record](deployment-verification.md) for actual local checks and unverified external services. Example Company / 示例公司, `app.example.com`, `api.example.com`, `YOUR_PROJECT_REF` and `example-okr` are placeholders, not deployed resources.
