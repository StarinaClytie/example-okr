# Example OKR public release

This project is a generic software example. Example Company / 示例公司, people, projects, resources, domains and account addresses are fictional demonstration content. The demo does not connect to an organization's existing services.

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

See [the installation guide](supabase-setup.md) for an independent backend and [the verification record](deployment-verification.md) for the tested scope. Example service addresses are placeholders, not hosted demos. Mail delivery has no default sender or application URL; configure your own resources explicitly.
