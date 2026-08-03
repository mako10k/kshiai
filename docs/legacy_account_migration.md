# Legacy account migration

Use the operator-only migration when a verified Supabase identity must inherit
an existing SQLite username's application data. The target application user
must already have been created by a successful Supabase login and must not own
characters or battles.

The command deliberately requires both identities. It never infers a link from
an unverified legacy username or email address.

## Prerequisites

- Stop backend writes for the final apply.
- Back up the SQLite database and the current PostgreSQL tables.
- Sync `DIRECT_URL` and every `R2_*` setting into the ignored `.env`.
- Retain the SQLite database and local media directory through the rollback
  window.

## Dry run

Omit `--apply` to upload and validate the media, exercise the complete database
transaction, roll PostgreSQL back, and remove any R2 objects created by the run:

```bash
secdat exec --inject secret:only=DIRECT_URL -- \
  npm run migrate:legacy-account --workspace @kshiai/backend -- \
  --source backend/data/kshiai.db \
  --legacy-username <legacy-username> \
  --target-email <verified-supabase-email>
```

## Apply

After the dry run succeeds, stop the backend and repeat the same command with
`--apply`:

```bash
secdat exec --inject secret:only=DIRECT_URL -- \
  npm run migrate:legacy-account --workspace @kshiai/backend -- \
  --source backend/data/kshiai.db \
  --legacy-username <legacy-username> \
  --target-email <verified-supabase-email> \
  --apply
```

The migration uses a PostgreSQL advisory lock and one database transaction. It
imports the coherent SQLite dataset needed by historical battles, remaps only
the selected legacy owner's IDs to the linked Supabase application user,
removes old sessions, rewrites local media URLs, and verifies every uploaded R2
object by public GET and byte size. It fails closed if the target already owns
application data, source counts differ, references remain on the old user, or
local media URLs remain.

Migration `0005_normalize_legacy_battlefields.sql` converts the old Japanese
custom-battlefield category to the current `custom` enum value. The repository
also performs the same narrow soft repair while reading historical records.

After apply, restart the backend and verify the target account through the
repository/API paths, not only with raw table counts. Deleted characters remain
deleted and are therefore excluded from the active character list.
