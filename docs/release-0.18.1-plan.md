# v0.18.1 release plan

Status: release preparation in progress. Production remains on v0.17.4 until
all checks, Stage, and the bounded existing-character acceptance flow pass.

## Release intent

v0.18.1 repairs the configured-provider boundary that blocked the v0.18.0
existing-character upgrade. The provider now receives the complete strict
`CharacterDefinitionV2` JSON Schema. The server retains its independent Zod,
reference-integrity, disclosure, public-profile, and claim validations. A
schema-valid but semantically rejected definition receives at most one bounded
repair request carrying only the rejected candidate, valid deterministic base,
frozen owner source, and bounded validation issues. A second rejection leaves
the candidate unactivated.

This patch implements ADR 0011's accepted authoring and upgrade direction. It
does not change authoritative state ownership, selection rules, disclosure,
provider order, billing, or deployment topology, so no new ADR is required.

## Frozen release boundary

- Version and tag: `0.18.1` / `v0.18.1`.
- Releasable branch: `main`, after a squash merge and all four required checks
  pass on the exact merged SHA.
- Stage configuration remains `narration_guarded`, dialogue projection override
  `none`, and battle pacing `candidate-12-v2`.
- Stage and Promote must use one exact tag, backend image digest, Cloud Run
  revision, and Worker version.
- Migration `0017_structured_character_assets.sql` remains the latest migration;
  this patch adds no schema or bulk-data operation.

## Acceptance

- Root, shared, backend, and frontend versions plus the lockfile are exactly
  `0.18.1`.
- The focused provider adapter regressions prove:
  - an initially valid definition uses one provider call;
  - one strict-schema failure receives one validation-bound repair;
  - an invalid repair fails closed without a third call;
  - the generated response schema contains no self-reference.
- A configured xAI call over the retained Synthetic Nagi profile returns a
  strict valid definition without printing the profile or secret material.
- `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` pass.
- `validate`, `security`, `backend-image`, and `worker` pass on the exact merged
  commit; the annotated tag resolves to that commit.
- Stage applies or confirms migration 0017 and passes health, PostgreSQL,
  protected origin, authentication, R2, Cloud Tasks OIDC, SSE, and the exact
  LLM-free provider-accounting fixture.
- Before Promote, use only the two dedicated E2E characters required by the
  production smoke:
  1. read both as owner-manageable, non-selectable, and absent from selection;
  2. create one explicit upgrade candidate per character with a frozen new
     idempotency key, without retrying an ambiguous request;
  3. read each candidate as still non-selectable;
  4. accept each candidate once as its Synthetic owner;
  5. read both as ready and cross-account selectable.
- The failed v0.18.0 Nagi authoring attempt remains immutable evidence. Do not
  delete or rewrite it; a v0.18.1 attempt uses a new idempotency key.

## Promotion and rollback

- Record the active v0.17.4 Cloud Run revision and Worker version before
  promotion.
- Dispatch protected Promote exactly once with the revision and Worker version
  recorded by successful v0.18.1 Stage.
- Require production health, direct-origin protection, Supabase authentication,
  SSE smoke, 100 percent backend/Worker traffic readback, GitHub Release
  publication, and immediate error inspection.
- On a failed production smoke, use the workflow's automatic application
  rollback. Do not roll back migration 0017 or delete immutable generations and
  authoring evidence.
