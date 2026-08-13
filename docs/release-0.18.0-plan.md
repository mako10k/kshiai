# v0.18.0 release preparation

Status: release candidate preparation in progress. Local acceptance passed;
Stage, Promote, and production observation evidence are not yet claimed.

## Release intent

v0.18.0 is the pre-public structured-character compatibility cutover. It
separates authoritative structured definition, disclosure policy, public
profile, private psyche, narrator perspectives, and image input; adds explicit
owner acceptance and latest-version upgrade; and prevents unsupported
characters from entering new battles. It also removes internal Referee audit
prose from public judgment presentation and adds a deterministic narrator
presentation-focus projection.

This release is a coherent checkpoint, not completion of `SDA_CHARACTER`.
Action-norm conflict and relationship-precedence receipts, remaining lifecycle
integration cases, and final legacy direct-mutation removal remain planned and
must not be reported as accepted by this deployment.

## Frozen release boundary

- Version and tag: `0.18.0` / `v0.18.0`.
- Releasable branch: `main`, after the release PR is squash-merged and all four
  required checks pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage must build `@kshiai/shared` before the LLM-free receipt fixture and must
  stage the backend and Worker from one exact tag.
- Promote is a later protected action and must use only the backend revision and
  Worker version recorded by the successful Stage run.
- No production battle observation is part of this release preparation.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.18.0`.
- `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` pass.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact commit
  merged to `main`.
- The annotated `v0.18.0` tag resolves to that exact merged commit.
- Stage applies `0017_structured_character_assets.sql`, passes the existing
  LLM-free provider-accounting fixture, and records the immutable backend image
  digest, Cloud Run revision, and Worker version.
- Stage verifies health, PostgreSQL, protected direct origin, authentication,
  R2, Cloud Tasks OIDC, and SSE without silently treating unsupported
  characters as selectable.
- Before Promote, read back that existing characters remain owner-manageable and
  unselectable, then explicitly upgrade and accept only the bounded characters
  required for the production smoke.

## Database, compatibility, and rollback

Migration `0017_structured_character_assets.sql` adds compatibility-state and
authoring-attempt tables. It performs no eager character inference or backfill.
Existing characters therefore read as unsupported for new selection until an
owner completes the explicit V2 upgrade workflow.

The current v0.17.4 Cloud Run revision and Worker version must be recorded by
Stage/Promote as rollback targets. Application rollback leaves migration `0017`
and any immutable V2 asset generations in place. v0.17.4 ignores the new tables,
so rollback restores the old application behavior but does not provide V2
readiness enforcement for generations authored after the migration. If a
release fault affects authoring or selection, stop new character activation
before application rollback; do not delete the migration, immutable
generations, or authoring evidence.

## Local evidence

- shared: 235 tests passed;
- backend: 218 tests passed;
- frontend: 15 tests passed;
- deployment contract: 3 tests passed;
- all workspace type checks passed;
- shared, backend, and frontend production builds passed;
- focused structured-character projection regressions: 56 passed;
- patch whitespace validation passed.

Detailed implementation evidence is retained in
[`evidence/structured-character-p2-checkpoint-2026-08-13.md`](evidence/structured-character-p2-checkpoint-2026-08-13.md).
