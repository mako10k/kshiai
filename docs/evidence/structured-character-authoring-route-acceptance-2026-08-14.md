# Structured character authoring and route acceptance evidence

- Date: 2026-08-14
- Authority: ADR-0011 (`Accepted`)
- PERT task: `SDA_CHARACTER` (`active`)
- Scope: local implementation and verification only
- Excluded: deployment, release, bulk migration, and production operations

## Result

The authoring and route-level integration acceptance matrix is closed. The
runtime and persistence receipts prove all five boundaries named by the prior
checkpoint:

| Boundary | Runtime receipt |
| --- | --- |
| Authoring-attempt expiry | Confirmation commits `expired` and source removal before returning `AUTHORING_ATTEMPT_EXPIRED`; no character or generation is activated. An expired upgrade becomes ineligible `upgrade_failed` with `authoring_attempt_expired`. |
| Concurrent current-pointer drift | A revision candidate bound to generation 1 is rejected after a concurrent portrait commit moves the pointer to generation 2. The candidate transaction appends no generation, does not overwrite the sheet, and remains awaiting owner acceptance. |
| Provider partial failure | Injected initial-character and later profile-provider failures through `POST /api/characters/generate` return 502, persist each attempt as `failed`, and leave both the character row and immutable generation set empty. |
| Route selector exclusion | Authenticated `GET /api/characters?selectable=true`, `GET /api/match/candidates`, `POST /api/match/random`, and `POST /api/match/auto` expose ready V2 characters and exclude legacy unsupported characters. |
| Direct-battle rejection | Authenticated `POST /api/battles` returns 409 for both an unsupported player character and an unsupported opponent; neither request creates a battle. |

The route builder accepts an optional LLM provider so the production route can
be exercised at the real HTTP, service, and persistence seams with a bounded
failure fixture. Normal runtime construction still creates the configured
provider when no override is supplied.

## Regression anchors

- `backend/src/repositories/character-assets-v2.test.ts`
  - persisted creation and upgrade expiry;
  - current-pointer drift with transaction rollback and immutable-generation
    count verification.
- `backend/src/routes-structured-character-acceptance.test.ts`
  - initial and partial provider failure through the authenticated authoring route;
  - owner, search, random, and auto selector exclusion;
  - fail-closed direct battle creation for both sides.

## Validation

- `npm test`: passed
  - shared: 242 tests;
  - backend: 225 tests;
  - frontend: 15 tests;
  - deployment worker: 3 tests.
- `npm run typecheck`: passed for all workspaces and the deployment worker.
- `npm run build`: passed for shared, backend, and frontend. Vite retained its
  existing non-blocking large-chunk warning.
- `git diff --check`: passed.

## Follow-up result

The bounded legacy-fallback removal and its route/persistence regression matrix
were subsequently closed in
[`structured-character-cutover-acceptance-2026-08-14.md`](structured-character-cutover-acceptance-2026-08-14.md).
That evidence completes the local `SDA_CHARACTER` acceptance boundary. The next
PERT frontier is `SDA_BATTLEFIELD`.

Production Promote for v0.18.0 remains a separate protected decision and is not
authorized by this local evidence.
