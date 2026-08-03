# Distributed runtime

The production backend is stateless: PostgreSQL owns application and
coordination state, while Cloudflare R2 owns generated images. Local SQLite and
`data/media` remain development-only fallbacks.

## Database coordination

Apply `backend/migrations/0003_distributed_runtime.sql` through the migration
runner. It creates:

- `battle_leases`, a ten-minute renewable lease acquired before any battle
  advance. A competing backend returns `BATTLE_BUSY` instead of resolving the
  same turn twice.
- `idempotency_keys`, shared by every instance. Battle create and advance
  requests require an `Idempotency-Key` header (8-128 safe characters). A
  completed key replays its saved response, concurrent reuse returns 409, and
  reuse with a different request returns a conflict.

```bash
secdat exec --inject secret:only=DIRECT_URL -- \
  npm run migrate:postgres --workspace @kshiai/backend -- --apply
```

The frontend generates a new UUID for each create or advance operation. A
caller that retries an HTTP request must reuse the same key.

## Cloudflare R2

Create a bucket and an object read/write API token, then configure:

```dotenv
MEDIA_STORAGE=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=https://media.example.com
```

`R2_PUBLIC_BASE_URL` must be an enabled public `r2.dev` origin or custom domain.
The backend writes through R2's S3-compatible endpoint using region `auto` and
stores each generation under a new immutable key. Old portrait URLs therefore
remain valid for the previous-image toggle without copying or overwriting an
object. Cloudflare documents the endpoint and JavaScript SDK configuration in
its [AWS SDK v3 example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

Production startup fails closed unless `DATABASE_URL` is set and
`MEDIA_STORAGE=r2` has every required R2 setting. Generated-image diagnostics
go to process logs in production instead of a local log file.

## Validation

```bash
npm run build
npm run typecheck
npm test
secdat exec \
  --inject secret:only=DATABASE_URL \
  --inject secret:only=DIRECT_URL \
  --inject secret:only=SUPABASE_PROJECT_REF -- \
  npm run smoke:postgres-runtime --workspace @kshiai/backend
```

The smoke test creates an isolated PostgreSQL schema, races two lease owners,
verifies a shared idempotency record, and removes the schema afterward. R2
object upload requires separately provisioned R2 credentials; unit tests use a
fake S3 writer and do not contact the bucket.
