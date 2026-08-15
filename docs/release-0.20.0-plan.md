# v0.20.0 release plan

Status: preparing the release commit. Production remains on v0.19.1 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.20.0 detaches character, battlefield, and narration-style authoring from the
owner HTTP request. Begin routes return `202`, a family-aware worker runs the
provider, and owners accept or compare on dedicated review screens. Burger
notifications and list marks project from attempt state.

This is a minor release because it adds user-facing queue, review, and
notification behavior and a new persistence boundary. It implements Accepted
ADR-0014.

## Frozen release boundary

- Version and tag: `0.20.0` / `v0.20.0`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- Migrations `0020`, `0021`, and `0022` are additive. They add job and
  notification tables and `owner_notifications.asset_type`. They do not rewrite
  existing attempts or generations.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.20.0`.
- Character, battlefield, and narration acceptance suites prove `202` begin,
  drain-to-review, failed latest, stale confirm refusal, list marks, and
  notification hrefs.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.20.0` tag resolves to that commit.

## Database, compatibility, and rollback

Migrations `0020` through `0022` are forward-only and additive. Application
rollback does not drop those tables. v0.19.1 remains compatible because it does
not read the new job or notification tables.

If Stage or production smoke finds an authoring or review fault, stop traffic
progression, keep `v0.20.0`, and issue a new patch after correction.
