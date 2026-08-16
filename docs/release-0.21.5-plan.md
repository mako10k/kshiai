# v0.21.5 release plan

Status: preparing the release commit. Production remains on v0.21.4 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.5 is a backward-compatible patch. It unsticks battles left with an
`active` advance operation after the v0.21.3 turn-record save failure. A new
advance that already holds the battle lease adopts the orphaned operation
instead of returning `ADVANCE_OPERATION_CONFLICT`. The battle screen reuses
the same idempotency key across retries of one advance.

## Frozen release boundary

- Version and tag: `0.21.5` / `v0.21.5`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.5`.
- Scene-beat wiring tests prove an orphaned `active` advance with a different
  operation id completes instead of throwing.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.5` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Existing in-progress battles keep their recorded revisions
and can retry the leftover advance after Promote. Application rollback returns
to v0.21.4.

If Stage or production smoke finds an advance-operation fault, stop traffic
progression, keep `v0.21.5`, and issue a new patch after correction.
