# v0.21.1 release plan

Status: preparing the release commit. Production remains on v0.21.0 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.1 is a backward-compatible patch for the battle screen after v0.21.0.
Auto-follow now treats the usable bottom as the viewport minus the bottom
navigation inset. The battlefield object list is a closed compact accordion
that omits character rows, portable/usable facts, and duplicate labels.
Battlefield instances stay one-fight: `POST /battlefields/from-battle` and
the save buttons are removed.

This is a patch because it changes only battle presentation and removes an
unused persist path. It does not add user-facing authoring routes or a
database migration.

## Frozen release boundary

- Version and tag: `0.21.1` / `v0.21.1`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.1`.
- Scroll tests prove latest-position uses the bottom-nav inset. Shared
  projection tests keep the compact object list.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.1` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Application rollback returns to v0.21.0. Queue, review, and
notification tables from migrations `0020` through `0022` stay in place.

If Stage or production smoke finds a battle-screen or persist-path fault, stop
traffic progression, keep `v0.21.1`, and issue a new patch after correction.
