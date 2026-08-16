# v0.21.6 release plan

Status: preparing the release commit. Production remains on v0.21.5 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.6 is a backward-compatible patch. It separates the battle screen into a
match snapshot, a narration story stream, and one sequential auto-advance
loop. The previous effect that rescheduled on turn and log length could skip
the next turn after a mid-advance snapshot refresh, leaving the UI on
「自動進行中」 with no error.

## Frozen release boundary

- Version and tag: `0.21.6` / `v0.21.6`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.6`.
- Frontend story/progress model tests and battle-screen Playwright cover the
  display split and log fallback.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.6` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Existing in-progress battles keep their recorded revisions.
Application rollback returns to v0.21.5.

If Stage or production smoke finds a battle-screen stall, stop traffic
progression, keep `v0.21.6`, and issue a new patch after correction.
