# Example OKR — development handover

Example OKR is a reusable project with Example Company / 示例公司 sample content. No example hostname, organization, account or bucket identifies an operating deployment. `app.example.com`, `api.example.com` and `example-okr` are placeholders; replace them with resources you control.

## Start here

- [README](../README.md): local demo, application modes and checks.
- [Fresh-install guide](supabase-setup.md): independent Supabase project, initial administrator, SMTP, attachment API and resource notifications.
- [Verification record](deployment-verification.md): actual local results and the external-service verification boundary.
- [English user guide](user-guide.en.md) / [中文使用指南](user-guide.zh-CN.md): workflows and role boundaries.

## Development boundaries

The browser demo uses in-memory data and needs no database, mail or deployment. Persistent operation uses Supabase Auth/PostgreSQL and row-level security. Private attachment binaries use OSS through the separately running attachment API. Auth SMTP and resource notification emails have independent configuration.

Use the Node version in `.nvmrc` and `npm ci`. Run application tests, type checking and both builds before publishing. Database validation needs Docker and the pinned Supabase CLI. Run reset commands only on disposable local databases. Initialize a first administrator using `scripts/bootstrap-admin.sql` only on a new independent instance.

Keep actual credentials in ignored local files or your own secret manager. Never put server keys in browser variables. No real deployment access, company operation history, cloud inventory or production incident log is part of this handover.

## Before operating your own instance

Record your own deployment owner, protected secret locations, backup/restore procedure and migration history outside the public repository. Complete hosted Auth delivery, HTTPS proxy and private OSS acceptance checks using your own independent test environment. Example domains are documentation placeholders and have not been deployed or tested as public services.

Design notes in `superpowers/` describe development proposals and implementation plans, not evidence that every proposed feature is implemented or deployed. The installation guide and verification record define the current operational scope.
