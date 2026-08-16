# v0.21.0 release plan

Status: preparing the release commit. Production remains on v0.20.1 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.21.0 adds the same public / friends / private exposure used by characters to
battlefields and narration styles. It also applies the character-definition fill
pattern to battlefield create, revision, and upgrade, and keeps the burger menu
to an unread count above the bottom navigation.

This is a minor release because it adds user-facing visibility controls and
selection filters. It does not change structured definition schemas or add a
database migration.

## Frozen release boundary

- Version and tag: `0.21.0` / `v0.21.0`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.21.0`.
- Battlefield fill tests prove a natural string-description fill applies and
  keeps coefficients. Visibility tests prove public/friends/private exposure.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.21.0` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Omitted visibility on existing `sheet_json` means public.
Application rollback returns to v0.20.1. Queue, review, and notification tables
from migrations `0020` through `0022` stay in place.

If Stage or production smoke finds an authoring or visibility fault, stop
traffic progression, keep `v0.21.0`, and issue a new patch after correction.
