# Example OKR public release

This project is a generic software example. Example Company / 示例公司, people, projects, resources, domains and account addresses are fictional demonstration content. The demo does not connect to an organization's existing services.

## Public browser demo

[Open Example OKR](https://starinaclytie.github.io/example-okr/). GitHub Pages serves only the static in-memory demo, with no Supabase, mail or OSS credentials. Role switching is for exploring fictional sample identities. Changes reset on refresh; no shared user data is saved.

The Pages workflow builds with `VITE_APP_MODE=demo`, `VITE_DEMO_STATIC_HOST=true` and the repository asset base. It blanks Supabase browser configuration explicitly. Hash routing is used only for this static demo; persistent deployments retain normal browser routing and need an SPA fallback.

## Run locally

Use the Node version in `.nvmrc`, then:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

No database, hosting account, email provider or object-storage credentials are needed for this in-memory demo. Changes reset on refresh. Fixed sample dates are illustrative rather than current operational records.

## Publish a clean copy

The clean source export contains application code, migrations, regression tests, example configuration, generic documentation and current screenshots. It excludes Git history, original business inputs, local linkage and credentials, internal planning notes, old worktrees, generated knowledge graphs, dependencies and build output.

Use the clean export to initialize a new repository if publishing. Copying sanitized files into an existing repository does not remove content from its older commits. Keep private archives and the original working directory outside the release.

See [the installation guide](supabase-setup.md) for an independent backend and [the verification record](deployment-verification.md) for the tested scope. The reserved example service addresses are placeholders, distinct from the public GitHub Pages demo. Mail delivery has no default sender or application URL; configure your own resources explicitly.
