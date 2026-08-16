# v0.21.2 release plan

Status: preparing the release commit. Production remains on v0.21.1 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.2 is a backward-compatible patch so operators can open the real
`BattlePage` after Promote. Admin and developer callers mint a one-shot
password for the existing E2E fixture identities and sign in through the
normal Supabase password grant. Playwright lives in the repository for GUI
verification and is not a required merge check.

This is a patch because it adds an internal operator path only. It does not
change player-facing routes or add a database migration.

## Frozen release boundary

- Version and tag: `0.21.2` / `v0.21.2`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.
- Stage binds `SUPABASE_SECRET_KEY` from `kshiai-supabase-secret-key`.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.2`.
- Mint tests prove general/test/e2e callers receive 404, admin/developer can
  mint, a second mint replaces the password, and the audit row has no secret.
- Playwright battle-screen smoke proves the latest log sits above the bottom
  navigation, the object accordion starts closed, and save-from-battle is gone.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.2` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Application rollback returns to v0.21.1. Queue, review, and
notification tables from migrations `0020` through `0022` stay in place.

If Stage or production smoke finds an E2E mint or re-entry fault, stop traffic
progression, keep `v0.21.2`, and issue a new patch after correction.
