# Private attachment deployment

Configure your own private OSS bucket (for example, `example-okr`) and restricted credentials. Both daily-report and resource attachments use the same attachment API; PostgreSQL remains responsible for metadata and authorization. Configure exact-origin CORS for your application, such as the placeholder `https://app.example.com`. Actual OSS upload, download and signed URL behavior require your own independent acceptance test.

See the [canonical installation guide](supabase-setup.md) for maintained steps and the [verification record](deployment-verification.md) for actual local checks and unverified external services. Example Company / 示例公司, `app.example.com`, `api.example.com`, `YOUR_PROJECT_REF` and `example-okr` are placeholders, not deployed resources.
