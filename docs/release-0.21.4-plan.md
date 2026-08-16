# v0.21.4 release plan

Status: preparing the release commit. Production remains on v0.21.3 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.4 is a backward-compatible patch. It fixes the live v0.21.3 failure on
the first open-beat combat turn after a scene-beat close that applied a
semantic or world patch. Skip-path turn records now own only the current
turn's transitions.

## Frozen release boundary

- Version and tag: `0.21.4` / `v0.21.4`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.4`.
- Turn-record tests prove a stale previous-turn patch does not enter the skip
  record. Scene-beat wiring tests prove the first skip after a beat-close
  semantic patch saves and advances past turn 4.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.4` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Existing in-progress battles keep their recorded revisions
and can retry the failed advance after Promote. Application rollback returns
to v0.21.3.

If Stage or production smoke finds a skip-record or beat-close fault, stop
traffic progression, keep `v0.21.4`, and issue a new patch after correction.
