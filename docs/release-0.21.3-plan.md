# v0.21.3 release plan

Status: preparing the release commit. Production remains on v0.21.2 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.3 is a backward-compatible patch. It restores story auto-follow inside
the log container and ships the first scene-beat slice so new battles show
several committed combat steps in one 物語 block without adding a narration
or expression call on every micro-turn.

## Frozen release boundary

- Version and tag: `0.21.3` / `v0.21.3`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.3`.
- Scroll tests prove the log pane follows. Scene-beat tests prove new battles
  freeze K=3 and open-beat combat does not enqueue narration.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.3` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Existing battles omit `sceneBeat` and keep 1:1 combat
narration. Application rollback returns to v0.21.2.

If Stage or production smoke finds a follow or beat-close fault, stop traffic
progression, keep `v0.21.3`, and issue a new patch after correction.
