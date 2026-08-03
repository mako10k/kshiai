# PostgreSQL migration

The production target is PostgreSQL 17 on Supabase in `ap-northeast-1`.
SQLite remains the live source until the asynchronous repository cutover is
accepted. These commands never require printing a connection string.

Database SSL enforcement is enabled on the Supabase project. The checked-in
client configuration also verifies the server certificate and hostname.

## Connection roles

| Variable | Purpose |
|---|---|
| `DIRECT_URL` | Schema migrations and one-shot SQLite import |
| `DATABASE_URL` | Runtime session-pooler connection used after repository cutover |
| `DATABASE_SCHEMA` | Runtime schema; defaults to `public` and is validated as an identifier |
| `DATABASE_POOL_MAX` | Per-instance PostgreSQL pool size; defaults to 10 |
| `SUPABASE_PROJECT_REF` | Fail-closed check that `DIRECT_URL` targets the intended project |

Both PostgreSQL clients require TLS even if the copied URL omits
`sslmode=require`. The client verifies the server with the public Supabase 2021
root CA bundled at `infra/supabase-ca-2021.crt`; `POSTGRES_CA_CERT_PATH` can
override it during certificate rotation. The bundled certificate comes from
Supabase's Dashboard download URL and has SHA-256 fingerprint
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
`SUPABASE_ACCESS_TOKEN` is an operator credential and must not be injected into
the running application.

## Runtime selection

The backend selects PostgreSQL whenever `DATABASE_URL` is present. Without it,
development and tests continue to use SQLite. `NODE_ENV=production` fails
closed unless `DATABASE_URL` is set, so a production restart cannot silently
return to instance-local SQLite.

All repositories, authentication sessions, image quota events, and balance
observations use the asynchronous database boundary. PostgreSQL connections
explicitly set and verify `DATABASE_SCHEMA` on each pooled connection. Local
JSONL balance logs are disabled in PostgreSQL mode.

## Safety model

The data tool has three distinct modes:

- no target flag: inspect SQLite only;
- `--verify-target`: import and validate inside a PostgreSQL transaction, then
  roll everything back;
- `--apply`: upsert, validate exact table counts, reset identity sequences, and
  commit.

`--verify-target` and `--apply` refuse to run unless the direct hostname matches
`SUPABASE_PROJECT_REF`. Required entity references fail closed. Historical
image/balance audit IDs are reported but retained without foreign keys.

## Commands

Inspect the live SQLite source:

```bash
npm run migrate:sqlite-to-postgres --workspace=backend -- \
  --source backend/data/kshiai.db
```

Check pending PostgreSQL schema migrations:

```bash
secdat exec \
  --inject secret:only=DIRECT_URL \
  -- npm run migrate:postgres --workspace=backend
```

Apply schema migrations:

```bash
secdat exec \
  --inject secret:only=DIRECT_URL \
  -- npm run migrate:postgres --workspace=backend -- --apply
```

Exercise the complete import without retaining source data:

```bash
secdat exec \
  --inject secret:only=DIRECT_URL \
  --inject secret:only=SUPABASE_PROJECT_REF \
  -- npm run migrate:sqlite-to-postgres --workspace=backend -- \
  --source backend/data/kshiai.db --verify-target
```

Exercise the PostgreSQL runtime through the session pooler in an isolated,
automatically removed schema:

```bash
secdat exec \
  --inject secret:only=DIRECT_URL \
  --inject secret:only=DATABASE_URL \
  --inject secret:only=SUPABASE_PROJECT_REF \
  -- npm run smoke:postgres-runtime --workspace=backend
```

The smoke command validates authentication, sessions, characters, battles,
system presets, narration styles, image quotas, and balance observations. It
verifies the selected schema before writing and removes that exact temporary
schema on completion.

The final cutover import is intentionally separate and is not run during
schema qualification:

```bash
secdat exec \
  --inject secret:only=DIRECT_URL \
  --inject secret:only=SUPABASE_PROJECT_REF \
  -- npm run migrate:sqlite-to-postgres --workspace=backend -- \
  --source backend/data/kshiai.db --apply
```

Before the final command, stop writes to SQLite and take a recoverable copy of
the database plus its WAL state. After import, compare counts, run application
smoke tests against PostgreSQL, and retain the SQLite copy through the rollback
window.
