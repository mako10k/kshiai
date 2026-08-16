# v0.21.7 release plan

Status: preparing the release commit. Production remains on v0.21.6 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.7 is a backward-compatible patch. It reconstitutes scene beats so the
public clock is twelve turns and three engine beats sit inside each turn.
Narrator-facing copy and 物語 headings no longer print turn numbers. In-flight
battles without `sceneBeat.clock` keep the ADR-0016 increment.

## Frozen release boundary

- Version and tag: `0.21.7` / `v0.21.7`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.7`.
- Scene-beat wiring proves three combat advances hold `turn === 1` and the
  fourth sets `turn === 2`.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.7` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Existing in-progress battles keep their recorded revisions
and clock. Application rollback returns to v0.21.6.

If Stage or production smoke finds a turn-clock fault, stop traffic
progression, keep `v0.21.7`, and issue a new patch after correction.
