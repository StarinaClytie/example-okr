# Reproducibility verification — 17 October 2026

Validated locally on Node.js 24.11.0 / npm 11.6.1 with pinned Supabase CLI 2.121.0. The database stack used a temporary project named `okr-repro-check`, separate ports, and no linked hosted project. Only disposable fake identities were created. No production data, real email recipient, or OSS bucket was used.

## Passed

- Application suite: 636 tests across 73 files. A serial run passed; earlier runs during Docker image extraction had asynchronous UI timeouts.
- Configuration checks, frontend build and attachment-server build passed.
- Fresh Supabase startup and explicit local reset applied all 42 repository migrations.
- Database suite: 798 assertions across 21 files passed after aligning the RLS fixture timezone with the Shanghai report business date.
- First-administrator bootstrap: all 11 cases passed, including unconfirmed/unknown user rejection, nonempty identity rejection, unprivileged caller rejection, exact rerun without changes, and real authenticated identity resolution.
- Local Auth API smoke: signup required confirmation; confirmation and password-recovery messages were captured by the local SMTP inbox. Confirmed first administrator was initialized by the real SQL script. Another user remained pending until administrator approval, then logged in and read a persisted profile. An employee's approval/promotion request was denied with `42501`.
- Database lint: no errors; nine existing unused-parameter/variable warnings remain. The frontend build retains its existing bundle-size warning.

## Re-run

In a fresh disposable checkout, use `.nvmrc` and `npm ci`. For database tests, set `project_id = "okr-repro-check"` and choose unused ports in `supabase/config.toml`. Keep email confirmation enabled. Then:

```bash
npm exec supabase -- start
npm exec supabase -- db reset --local --no-seed
npm exec supabase -- test db --local
python3 scripts/test-bootstrap-admin.py supabase_db_okr-repro-check
node scripts/test-local-onboarding.mjs .
npm exec supabase -- db lint --local --fail-on error
npm exec supabase -- stop
```

The onboarding smoke intentionally creates fake Auth identities and a test organization; reset the disposable database before repeating it. Bootstrap tests roll back their own fixtures. Do not run either procedure against a populated environment. First startup downloads large platform images; one Storage image pull stalled locally and succeeded after a separate retry from the official registry.

The **Verify isolated database** workflow packages these checks for manual GitHub Actions execution; that hosted workflow has not yet been run. The separate demo workflow runs on pushes and pull requests.

## Still requires the deployer's environment

Fresh hosted migration/application deployment, authenticated HTTPS/reverse-proxy flows, public signup email delivery through the deployer's SMTP provider, external Resend delivery, and actual private OSS upload/download have not been verified. The local inbox proves Auth email generation and confirmation handling, not real-world deliverability. Attachment API tests/builds do not prove OSS credentials, bucket CORS or signed-URL behavior against a live bucket. Follow [the installation guide](supabase-setup.md) for those acceptance checks.

## Generic example acceptance — 18 October 2026

The public example was generalized and tested from an independent clean source export. All sample company, people, project, resource and service information is fictional; documentation example hosts are not live services.

- Brand and service identifiers were removed from current source, documentation, templates and filenames. Original business documents, operation records and obsolete linkage were excluded from the release; original inputs were preserved in a private archive outside the project.
- The release omits old Git history, private files, old worktrees and internal planning artifacts. The original repository history was not rewritten; publish from the clean export rather than reusing its old history.
- Screenshots were recaptured from the local Example OKR demo with generic software/office sample data.
- Clean install succeeded. All **653 application tests across 74 files**, **33 smoke checks**, configuration verification, TypeScript/frontend build and attachment-server build passed.
- The smoke command now references existing test files and checks their existence instead of silently skipping a nonexistent target.
- Missing notification sender/application URL now disables delivery with `email_not_configured`. Application links require an explicit HTTPS origin (loopback HTTP is allowed for local development); userinfo, paths, queries and fragments are rejected. Regression tests verify missing/invalid configuration makes no provider request.
- A disposable stack created from the clean export applied all **42 migrations** after reset. All **798 database assertions**, **11 bootstrap cases**, local signup/confirmation/approval/login/persistence checks and local password-recovery mail capture passed. Database lint had no errors and nine existing unused parameter/variable warnings.
- External SMTP, Resend, OSS and hosted publication were not exercised. No previous organization's service was contacted during this acceptance run. GitHub-hosted workflow execution remains unverified.

## 2026-11-05 public review hardening

- Replaced remaining legacy project aliases in current source; removed a handover reference to an excluded internal directory.
- Added MIT license, contribution guidance, private vulnerability reporting policy, business timezone and proxy boundaries.
- Updated locked vulnerable dependencies; `npm audit` reported zero vulnerabilities. Replaced unbounded `latest` declarations with bounded version ranges. Added a high-severity audit gate and automated dependency update configuration.
- Application verification: **672 tests in 76 files passed**; frontend typecheck/build and attachment server build passed. The accessibility contract test isolates lazy chart rendering; chart implementations retain their separate tests. The existing frontend bundle-size warning remains.
- Fresh disposable PostgreSQL installation: **44 migrations applied**, **816 pgTAP assertions in 22 files passed**, including resource checksums, caller-aware mail claims, retry limits and immutable provider payload snapshots. Because the host-to-Docker database port timed out, this run executed the same SQL test files through `docker exec`/`psql`, preparing pgTAP and checking every test plan, assertion and command exit status. The database CLI lint and full local Auth onboarding were not rerun in this pass.
- Attachment signing now binds a creation-only header and fails closed for versioned/suspended buckets; unit tests verify the actual OSS signature. Resource attachment ETags are persisted by a new migration.
- Email delivery uses caller-aware atomic authorization, a service-only complete provider payload snapshot, a stable provider idempotency key, a bounded retry window and checked delivery-status persistence. Handler tests use simulated provider/database failures, not live mail.

Live OSS behavior, external email delivery and a hosted example remain unverified. Existing installations must follow the coordinated function/database upgrade and attachment URL-drain procedure in the installation guide. Expired or pre-upgrade ambiguous email attempts require operator reconciliation. No existing organization's hosted services were accessed.

## 2026-11-06 attachment API request budgets

The attachment API now applies a shared process-level admission budget before identity-provider calls and a verified-account budget before database authorization and OSS operations. Both attachment families share the budgets. Tests cover unauthenticated load, token rotation, forged forwarding headers, independent accounts, window reset, concurrent requests, health-check availability and authentication-provider failure.

Validation: **686 application tests across 78 files passed**, frontend/typecheck and attachment server builds passed, and dependency audit reported **zero vulnerabilities**. Independent review found no high/medium issues. No database schema or real cloud service was changed by this update.

Quotas are process-local and reset on restart; multi-instance deployments need gateway or shared-store enforcement. The server keeps proxy trust disabled. See the installation guide for settings and proxy requirements.

## 2026-11-07 safe attachment error responses

The attachment API now returns fixed JSON messages for parser, routing, middleware and database-operation failures instead of forwarding upstream messages or development stack traces. Failed RPC results cannot use success/redirect status codes. Responses, including signed-URL JSON, carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

Validation: **694 tests in 79 files passed**, frontend/typecheck and attachment server builds passed, dependency audit reported **zero vulnerabilities**, and independent review found no high/medium issues. Eight new regression cases first failed against the previous implementation and passed after the fix; they cover malformed and oversized JSON, encodings, route parameters, unknown endpoints, database details, invalid failure statuses, unexpected middleware errors and signed-URL response headers. No database schema, public demo behavior or live cloud service was changed.
