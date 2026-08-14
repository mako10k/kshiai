# Structured narration cutover acceptance — 2026-08-14

- Scope: `SDA_NARRATION`
- Authority: ADR-0010 and Accepted ADR-0013
- Result: local implementation acceptance complete
- Excluded authority: push, release, Stage, production Promote, and bulk user
  migration

## Implemented boundary

- `NarrationDefinitionV2` validates requested perspective, closed voice and
  cadence controls, exact prologue/action/impact/release/judgment/aftermath
  policies, bounded presentation dimensions, stable rhetoric IDs, and tagged
  examples/counterexamples.
- The public style description is generated from a filtered projection and
  requires an independent per-segment claim receipt. Public DTOs no longer
  expose the raw legacy or compiled instruction.
- `narration-prompt-v2` deterministically compiles all six phase instructions,
  fixed authority precedence, bounded positive/counterexample selection, and
  an early anti-copy/no-fact clause.
- Schema-2 creation, revision, and explicit upgrade persist a candidate before
  confirmation. Atomic confirmation rechecks the expected generation and
  digest, appends an immutable generation, updates the read model, and moves
  the current pointer.
- Legacy user styles stay management-visible with an update action but are
  excluded from `selectable=true` and rejected by direct battle creation.
  Maintained system and E2E fixture styles use deterministic ready imports.
- Battle creation reads the exact ready generation and records its generation
  ID, digest, compiled snapshot, and compiler contract. It does not append or
  activate a narration-style generation.
- Prologue, combat action/impact/release, judgment, and aftermath consumers use
  their frozen compiled phase instructions. Legacy battle snapshots retain the
  previous instruction fallback.

## Persistence and HTTP evidence

`backend/src/routes-structured-narration-acceptance.test.ts` verifies the real
route and SQLite seams:

1. structure-provider failure leaves no row or generation;
2. management includes legacy rows while selectors and direct battle IDs reject
   them;
3. create and upgrade remain invisible/unselectable until owner confirmation;
4. confirmation replay returns the same generation;
5. expired attempts persist `expired`, release their upgrade hold, and create no
   generation;
6. concurrent current-pointer drift rejects a stale candidate before append;
7. a new battle binds the exact ready generation and digest, freezes
   `narration-prompt-v2`, and leaves the style generation count unchanged.

`packages/shared/src/structured-narration.test.ts` verifies strict phase and ID
validation, authority-marker rejection, public-projection exclusion,
deterministic compilation, example budgets, anti-copy language, all phase
consumer mappings, required compiler compatibility, and claim-receipt gating.

## Validation receipt

- `npm test`: passed — 514 tests total
  - shared: 253
  - backend: 243
  - frontend: 15
  - deployment worker: 3
- `npm run typecheck`: passed for shared, backend, frontend, and deployment
  contracts.
- `npm run build`: passed for shared, backend, and frontend. Vite emitted its
  existing large-chunk advisory; the build succeeded.
- `perttool document check docs/structured-domain-assets.pert`: passed with only
  the pre-existing reached-milestone and undeclared-acceptance warnings.
- `git diff --check`: passed.

## Remaining frontier

`SDA_INTEGRATION` is now the next PERT task. It must audit the combined three
asset families across search, matchmaking, replay, deletion, export,
observability, and cross-generation invariants before any publication or
production authority is considered.
