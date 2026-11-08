# Private attachment storage

Select one private bucket and provider per deployment: Alibaba Cloud OSS, AWS S3, or Cloudflare R2. The attachment API authorizes operations through Supabase and issues short-lived signed URLs; the browser transfers bytes directly to storage. PostgreSQL retains attachment ownership, object paths, state and verification metadata.

Choose the provider and bucket **before the first upload**. Existing OSS deployments keep working when `ATTACHMENT_STORAGE_PROVIDER` is omitted. This feature does not route old files across providers or migrate files. Changing credentials, bucket, endpoint or provider alone can break existing downloads. A later move requires a separately planned offline copy with writes paused, exact object-path and metadata verification, backups and a tested cutover.

## Server configuration

Copy `.env.server.example` to `.env.server.local` and fill only the selected provider's settings. Never put storage secrets or the Supabase service-role key in `VITE_*` variables, browser assets or source control. Start with `ATTACHMENT_ENV_FILE=.env.server.local npm run server:start` after `npm run server:build`.

| Variable | Meaning |
| --- | --- |
| `ATTACHMENT_STORAGE_PROVIDER` | `oss`, `s3`, or `r2`; default `oss` |
| `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` | Required for OSS |
| `OSS_BUCKET`, `OSS_REGION`, `OSS_ENDPOINT` | Required OSS bucket and service location; existing names unchanged |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` | Required for explicit `s3` or `r2` |
| `S3_SESSION_TOKEN` | Optional temporary-credential token |
| `S3_REGION` | Required for S3; R2 defaults to `auto` and accepts only `auto` |
| `S3_ENDPOINT` | Optional for AWS S3; required official account endpoint for R2 |
| `S3_FORCE_PATH_STYLE` | Optional strict `true`/`false`; defaults to `false` for S3 and `true` for R2 |

Use HTTPS service endpoints without credentials, path, query or fragment. For R2, use `https://<account-id>.r2.cloudflarestorage.com`, or the corresponding `.eu.r2.cloudflarestorage.com` / `.us.r2.cloudflarestorage.com` / `.fedramp.r2.cloudflarestorage.com` endpoint for that bucket's jurisdiction. The account ID must contain exactly 32 hexadecimal characters. Custom domains and arbitrary S3-compatible endpoints are rejected for provider `r2`; this validation is part of the versioning safety boundary. The supported targets are AWS S3 and R2; accepting a custom S3 endpoint does not certify other S3-compatible services. Cloudflare documents its [S3 endpoint and region](https://developers.cloudflare.com/r2/api/s3/api/) and [credential setup](https://developers.cloudflare.com/r2/get-started/s3/).

## Bucket and credentials

Keep the bucket private. For S3, retain Block Public Access; for R2, leave public bucket access and public custom domains disabled. Do not place private object responses or signed-URL API responses behind a shared CDN cache. Use the storage service endpoint for signed transfers, and keep API responses uncached. CORS is not authorization and does not make a bucket private.

For AWS S3, a dedicated server identity needs `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on this bucket's object ARN, and `s3:GetBucketVersioning` on its bucket ARN. `ListBucket` is not required by the adapter. Replace `YOUR_PRIVATE_BUCKET` below; the example assumes the standard AWS partition. Other partitions require their matching ARN prefix. Additional encryption controls, such as a customer-managed KMS key, may require separately scoped key permissions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:GetBucketVersioning",
      "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET"
    }
  ]
}
```

For R2, create an **Object Read & Write** S3 API token scoped to this bucket, rather than an account-wide administrative token. Store its access key and secret in the `S3_*` variables. See [R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/). For OSS, grant the corresponding bucket-scoped object read/write/delete permissions and `oss:GetBucketVersioning`; see the [OSS-specific setup guide](alibaba-oss-daily-attachments.md).

### Versioning and overwrite protection

AWS S3 and OSS require a **never-versioned** bucket. Enabled and suspended versioning are both rejected; use a fresh bucket if versioning has ever been enabled. The adapters check bucket versioning for upload signing, object verification, download signing and deletion, and fail closed on missing permission, a failed check or an unsupported state. Keep versioning disabled permanently, including while signed URLs are valid. AWS describes the never-versioned response in [GetBucketVersioning](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html).

R2 does not support the S3 bucket-versioning operation, so the R2 adapter skips that call only for the validated official R2 endpoint. Do not use the R2 selector to bypass checks on another service. See [R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).

Every signed upload binds its content type and an overwrite-prevention header: `If-None-Match: *` for S3/R2, or `x-oss-forbid-overwrite: true` for OSS. The browser must send the API-provided headers unchanged. Missing or altered signed headers invalidate the signature. AWS documents [conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html); Cloudflare documents [signed content types](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) and atomic conditional writes in its compatibility guide. Replacement files use a new attachment ID and object key. Do not let lifecycle rules or other writers delete or replace live evidence; prevention depends on the original key continuing to exist.

When upgrading from overwrite-capable upload signing, pause signing and wait at least 300 seconds for old upload URLs to expire before resuming. Deletion marks application metadata deleted before removing bytes. A still-valid upload URL may recreate unreachable bytes; remove such orphans only after URL expiry and after checking database deletion state. Never reuse deleted attachment keys.

## Browser CORS

Configure the bucket for the **exact frontend origins** that you operate, including scheme and port. Replace the illustrative origin below; avoid `*`. S3/R2 must allow `Content-Type` and `If-None-Match`; OSS must allow `Content-Type` and `x-oss-forbid-overwrite`. Allow `GET`, `PUT`, and `HEAD`. Expose `ETag` if browser-side inspection needs it; server-side HEAD verification does not depend on browser exposure.

For the AWS CLI `put-bucket-cors` configuration file, use this JSON. The S3 console CORS editor and R2 dashboard use the inner array of rules:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://okr.example.com"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["Content-Type", "If-None-Match"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

For OSS, configure the equivalent fields with `x-oss-forbid-overwrite` instead of `If-None-Match`. Test preflight requests from your actual application origin. Never make the bucket public to resolve a CORS error. See [AWS CORS configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html) and [R2 CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/).

The bucket's cross-origin transfers are separate from the attachment API. Serve the frontend and API through the same-origin reverse proxy described in the [installation guide](supabase-setup.md#7-configure-private-attachments). Keep the backend listener private; cross-origin API access is not enabled.

## Acceptance and verification limits

Local unit and integration contract tests can verify configuration, SDK commands, signatures, required headers and failure handling without cloud credentials. They do **not** establish that real AWS S3 or Cloudflare R2 uploads, account permissions, CORS or network delivery work. See the [verification record](deployment-verification.md) for recorded checks.

Before production, use your own private test bucket and authorized test accounts to upload, finalize, download, replace and delete both report and resource attachments. Verify actual bytes, content type, size and download filename/Content-Disposition; reject unauthorized access; confirm expiry, overwrite rejection and private access. For OSS/S3, also verify refusal when bucket-versioning checks fail. Record the provider, date and observed results without recording credentials or usable signed URLs.
