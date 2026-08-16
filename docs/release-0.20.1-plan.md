# v0.20.1 release plan

Status: preparing the release commit. Production remains on v0.20.0 until the
release PR, exact-commit checks, Stage, and Promote complete.

## Release intent

v0.20.1 is a backward-compatible patch for the character-migration type error
found after v0.20.0. Create, revision, and upgrade no longer send the full
CharacterDefinitionV2 structured-output schema. They fill missing fields with a
small required-and-nullable JSON schema whose descriptions are strings. The
server maps that fill onto the internal definition and keeps clause encodings,
consumer tags, and force/disposition coupling out of the model contract.

This is a patch because it changes only authoring fill validation. It does not
add user-facing routes or persistence.

## Frozen release boundary

- Version and tag: `0.20.1` / `v0.20.1`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- No database migration.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.20.1`.
- Shared and backend tests prove a natural string-description fill applies
  without repair, mixed fills coerce, and a non-object fill still fail-closes
  after one repair attempt.
- `npm test`, `npm run typecheck`, and lizard stay within the checked-in
  baseline.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact
  merged commit; the annotated `v0.20.1` tag resolves to that commit.

## Database, compatibility, and rollback

No schema change. Application rollback returns to v0.20.0. Queue, review, and
notification tables from migrations `0020` through `0022` stay in place.

If Stage or production smoke finds an authoring fill fault, stop traffic
progression, keep `v0.20.1`, and issue a new patch after correction.
