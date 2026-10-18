# Fresh installation: Supabase, email and attachments

This guide installs an independent copy using **your own hosted Supabase project**. The local demo needs none of these services. Self-hosted GoTrue has different operational configuration; the historical email-template notes are not hosted Supabase instructions.

The application onboarding flow is **self-registration → email confirmation → pending approval → administrator approval**. The old administrator-invitation guide describes a retired flow.

## 1. Prerequisites and configuration boundaries

Use the Node version in `.nvmrc`, run `npm ci`, and use the repository-pinned CLI through `npm exec supabase -- …`. Docker is required for local database validation, not for serving the static frontend against hosted Supabase.

| Component | Configuration | Where it belongs |
| --- | --- | --- |
| Browser application | `VITE_APP_MODE=supabase`, project URL, publishable/anon key | `.env.production.local` or protected build environment |
| Auth emails | SMTP provider, verified sender, Auth URL settings | Supabase Dashboard |
| Attachment API | Supabase URL/anon/service-role keys and OSS credentials | `.env.server.local` or protected server environment |
| Resource notification emails | Resend key, sender, application URL | Edge Function secrets |

Never give a service-role key, database password, SMTP password or OSS secret a `VITE_` prefix. Browser build variables are public. Copy example files to the `.local` filenames below; never put actual secrets into committed examples.

## 2. Validate the database locally

Use a fresh checkout and a disposable local Supabase stack, separate from any real organization. If another local stack already exists, first choose a distinct `project_id` and unused service ports in `supabase/config.toml`; see [running multiple local projects](https://supabase.com/docs/guides/local-development/running-multiple-local-projects). First startup downloads platform images and can take several minutes. Local Auth emails are captured in the local SMTP inbox rather than sent to real recipients:

```bash
npm exec supabase -- start
npm exec supabase -- db reset --local
npm exec supabase -- test db
npm exec supabase -- db lint --local
```

`db reset --local` deletes and recreates the local database. Use it only for this isolated test stack. **Do not reset a linked/production database.** The CLI applies every SQL file in `supabase/migrations/` in version order; do not use an old handpicked list or skip migrations. `supabase/tests/` contains database regression tests. The manually triggered **Verify isolated database** GitHub Actions workflow also runs the real first-administrator bootstrap tests in a disposable stack; it uses no hosted credentials. A successful frontend test run does not establish that migrations, RLS or live email delivery work.

## 3. Create your own hosted project and apply all migrations

Create a new Supabase project for this installation. Keep its database password in your password manager. Replace `YOUR_PROJECT_REF` with the reference from that new project's Dashboard, rather than copying a reference from historical documents.

```bash
npm exec supabase -- login
npm exec supabase -- link --project-ref YOUR_PROJECT_REF
npm exec supabase -- migration list --linked
npm exec supabase -- db push --linked --dry-run
```

Check that the linked project is your new independent project and that the pending list matches **all** repository migrations. Unexpected remote history indicates that this is not a fresh installation; investigate it before continuing. Then apply and verify:

```bash
npm exec supabase -- db push --linked
npm exec supabase -- migration list --linked
npm exec supabase -- db lint --linked
```

Do not create tables manually or repair migration history merely to bypass an error. For later upgrades, take a recoverable backup and review pending migrations first.

## 4. Configure Auth and its emails

In Authentication settings, enable email/password registration and **require email confirmation**. Set Site URL to your application origin and allow the exact local/production redirect URLs used by your installation. `supabase/config.toml` configures the local stack; it does not automatically configure your hosted Dashboard.

Configure custom SMTP and a sender/domain verified with your provider in the Supabase Dashboard. Auth confirmation and password recovery use this SMTP configuration, independently of resource notification emails. The default hosted email service is restricted and should not be treated as general delivery for public signups. Start with Supabase's supported templates; customize them in the Dashboard if needed. The historical GoTrue URL-template environment variables do not apply to hosted Supabase.

See the official [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) and [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Build and serve the application

Copy `.env.example` to `.env.production.local`, switch `VITE_APP_MODE` to `supabase`, and set the URL and publishable/anon key from your project. Replace every placeholder. Then:

```bash
npm run test:run
npm run typecheck
npm run build:production
```

Serve `dist/` over HTTPS with SPA fallback. For Nginx, the frontend location needs `try_files $uri $uri/ /index.html;`. Configure API proxy locations before the SPA fallback (section 7). Local development against your hosted test project uses `.env.local` with the same three frontend variables and `npm run dev`.

## 6. Initialize the first organization and administrator

1. Open your application and register the first administrator account. Confirm its email. The account cannot enter the workspace until initialization; an empty instance has no organization yet.
2. In your **new independent project's** Authentication users view, copy that account's user UUID.
3. Open `scripts/bootstrap-admin.sql`, fill in `v_user_id`, `v_organization_name` and `v_display_name`, then run the entire script in that project's SQL Editor as the database owner.
4. The script requires a confirmed Auth user and an empty business database. Repeating it immediately for the same administrator, before other identity data is added, makes no changes; incompatible existing state is rejected. Do not use it to promote accounts in an existing organization.
5. Sign out and back in. Verify administrator access. New coworkers register and confirm their emails, then the administrator approves them and assigns their roles through the user-management screen.

The bootstrap script is a one-time operator procedure, not a browser API or migration. Do not commit a populated copy containing personal information.

## 7. Configure private attachments

The current attachment binary path uses **Alibaba Cloud OSS**, with authorization and metadata in Supabase. Historical Supabase Storage migrations do not replace this attachment API.

Create a private OSS bucket and restricted credentials. Configure bucket CORS for the exact application origin, direct signed `PUT` uploads, required content headers, and downloads as appropriate. Never make the bucket public to resolve a browser CORS error. Confirm bucket region and endpoint against your Alibaba Cloud configuration.

```bash
cp .env.server.example .env.server.local
npm run server:build
ATTACHMENT_ENV_FILE=.env.server.local npm run server:start
```

Fill every required value in `.env.server.local` before starting. The explicit `ATTACHMENT_ENV_FILE` matters: the server otherwise reads `.env.production.local`. It defaults to `127.0.0.1:3001`; retain that binding behind a same-host reverse proxy. If running in containers, configure the bind address and network deliberately.

Proxy both `/api/attachments/` and `/api/resource-attachments/` to the attachment API **without stripping their prefixes**. For example, in the HTTPS server block:

```nginx
location /api/attachments/ {
    proxy_pass http://127.0.0.1:3001;
}
location /api/resource-attachments/ {
    proxy_pass http://127.0.0.1:3001;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

The frontend calls same-origin API paths. The Vite development configuration has no attachment proxy: test attachments through this proxy setup, or add your own development proxy. A running frontend alone does not provide upload/download support. `/api/health` on the server checks process availability, not OSS credentials or authorization correctness.

## 8. Deploy account management and optional resource emails

Deploy the current functions to your independent project:

```bash
npm exec supabase -- functions deploy admin-delete-user --project-ref YOUR_PROJECT_REF
npm exec supabase -- functions deploy resource-problem-notify --project-ref YOUR_PROJECT_REF
```

The hosted runtime provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; do not copy these into frontend files. Resource notifications additionally require:

```bash
cp .env.functions.example .env.functions.local
npm exec supabase -- secrets set --env-file .env.functions.local --project-ref YOUR_PROJECT_REF
```

Fill the Resend API key, verified sender and `RESOURCE_APP_URL` first. **Both `RESOURCE_APP_URL` and `RESEND_FROM_EMAIL` are required and have no defaults.** Set the URL to your own application origin, without a trailing slash, and the sender to an address on your verified domain. Missing or blank values fail closed; do not expect an automatic sender or site URL. No Resend provider configuration means notifications return `email_not_configured`; configuring Auth SMTP does not configure these emails.

See the official [Function secrets guide](https://supabase.com/docs/guides/functions/secrets). Keep function JWT verification enabled as specified in `supabase/config.toml`; application authorization checks also run inside the functions.

## 9. Acceptance checks and verification limits

Use two or more independent test identities and record which checks actually pass:

- Register, confirm email, observe pending approval, approve and assign a role; test logout/login and password recovery.
- Create an objective/KR, update progress, reload and confirm persistence. Check employee, project leader, HR and administrator permissions; unauthorized direct links and API calls must be denied.
- Upload, finalize, download, replace and remove both daily-report and resource attachments. Test an unauthorized account, invalid file types and the current 100 MiB OSS attachment limit (the older Supabase Storage bucket has a separate 10 MiB setting). Confirm objects stay private and signed URLs expire.
- Report a resource problem and verify delivery to the correct owner with a link to **your** site. Test Auth mail separately from business notification mail.
- Test deep-link refresh, both languages and mobile layout. Confirm no private credentials appear in built frontend assets, screenshots or logs.

Local tests, builds and isolated database checks do not certify a hosted deployment. **Live SMTP, Resend and OSS delivery need your own test credentials and remain unverified until you run these checks.** Consult the current [CLI reference](https://supabase.com/docs/reference/cli/introduction) for command details.

For operation, monitor database/storage/egress against your actual plan, back up before upgrades and rehearse restoration. Preserve the previous frontend release. On a failed release, stop affected writes and restore the frontend or apply a reviewed forward migration; do not delete tables or rewrite migration history as a rollback.

## 10. Recorded verification

See [the verification record](deployment-verification.md) for the actual local results and remaining hosted/SMTP/OSS checks. A successful local installation is not a claim that your hosted deployment has been validated.
