# Contributing

Start with the [README](README.md) and [installation guide](docs/supabase-setup.md). Use the Node version in `.nvmrc` and install the locked dependencies with `npm ci`.

For a bug report, include the application mode, commit, reproduction steps and expected result using fictional data. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Keep pull requests focused. Add regression coverage for behavior changes and run:

```bash
npm run verify:config
npm run test:run -- --maxWorkers=2
npm run typecheck
npm run build
npm run server:build
```

For database changes, add a new migration and pgTAP coverage, then run the isolated local database checks in the installation guide. Never edit an already published migration or reset a hosted database to make a test pass.

Do not commit real organizations, customer data, credentials, populated bootstrap scripts, internal planning notes or local deployment linkage. Keep reserved example domains and fictional fixtures. Use `npm ci` for reproduction; review dependency updates and their lockfile changes separately.
