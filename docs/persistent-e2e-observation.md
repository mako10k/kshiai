# Persistent E2E observation realm

This mechanism repeatedly exercises the production battle pipeline without
mixing its synthetic data into the general-player population.

## Access model

`users.account_kind` is a server-owned value with three allowed states:

| Kind | Realm | Visible character population |
| --- | --- | --- |
| `general` | general | general only |
| `test` | test | test and E2E |
| `e2e` | test | test and E2E |

Administrators can inspect characters in both realms. Test-realm custom
battlefields and narration styles are shared by administrators, test users,
and E2E users. A normal general user sees neither those assets nor test-realm
ratings. Custom assets belonging to another general user do not become shared
merely because the viewer is an administrator.

The production administrator allowlist is deployment configuration, not a
client claim. Stage binds `ADMIN_EMAILS=mako10k@mk10.org`, and Promote refuses
an artifact that does not contain that binding.

## Reused identities and fixtures

The observer job provisions these confirmed non-human Supabase accounts once
and then reuses them:

- `codex-e2e-observer@example.test` (`e2e`)
- `codex-e2e-opponent@example.test` (`test`)

Their runtime password is randomized on every run and is never stored in the
repository or artifact. The auth identities and mapped application users are
not deleted.

The job creates the two fixed characters, the rainy-alley battlefield, and the
causal-observation narrator only when their stable IDs do not exist. A later
run reuses the existing records without overwriting battle records, ratings,
or edits. An ownership mismatch or soft-deleted fixed character stops the run
instead of silently replacing data.

Every observation creates a new cross-account battle through `/api/battles`,
advances it through the production SSE endpoint until prologue, turns, and
aftermath are complete, and reads the persisted public battle back. No cleanup
is performed on either success or failure, so an incomplete battle remains
available for diagnosis.

## Running an observation

After a release is promoted, select that exact tag in GitHub Actions and run
**Observe persistent E2E battle** with:

- the same release tag;
- the active Cloud Run revision from Promote;
- a maximum advance count from 1 through 30 (normally 24);
- confirmation `OBSERVE <revision>`.

The protected workflow verifies the tag's required checks and the active
immutable revision before deploying a Cloud Run Job from that exact image. A
successful run records the database battle indefinitely and uploads a
sanitized JSON artifact for 90 days. The artifact contains synthetic account
labels, fixture disposition, per-advance timing, the public result, and public
narration. It excludes access tokens, auth/application user IDs, raw character
parameters, private semantic state, and rating internals.
