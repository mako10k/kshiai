# Structured battlefield cutover acceptance evidence

- Date: 2026-08-14
- Authority: ADR-0012 (`Accepted`)
- PERT task: `SDA_BATTLEFIELD` (`done`)
- Scope: local implementation and verification only
- Excluded: deployment, release, bulk migration, Stage, and production Promote

## Result

The bounded battlefield cutover is complete locally. A reusable
`BattlefieldDefinitionV2` is now separate from its derived public scene, the
battle-owned immutable instance, and subsequent mutable semantic/world state.
Battle creation reads one ready preset generation, runs the deterministic
`battlefield-instance-v2` compiler, and records the preset generation ID and
content digest in the battle manifest without appending another preset
generation.

Authoring now uses an explicit V2 structure stage before public-scene generation
and independent material-claim validation. Creation has no visible battlefield
row before owner confirmation. Revision, upgrade, and image operations append
immutable generations only after their respective confirmation or idempotent
operation boundary.

## Authority and runtime receipts

| Boundary | Receipt |
| --- | --- |
| Structured definition | Closed areas, topology, effects, objects, coefficients, evolution pressures, references, and global stable IDs are schema validated. |
| Public and image projections | Public scene claims require exact support receipts; hidden objects, mechanics, topology controls, and evolution controls are absent from public/image projections. |
| Deterministic instance | The same definition produces byte-equivalent instance, exact A/B entry locations, semantic seed, topology, effect/object IDs, and compiler contract without a provider call. |
| Evolution gate | Stagnation selects one authored affordance deterministically. The provider receives only that permission and explicit forbidden discontinuities; an empty affordance list causes no provider call. |
| Canonical environment gate | A proposed canonical object transition outside the selected area/object references is rejected without a public event or world mutation. |

## Route and persistence receipts

| Boundary | Receipt |
| --- | --- |
| Partial authoring failure | A structure-provider failure leaves a failed attempt but no battlefield row, candidate, or asset generation. |
| Create/review/confirm | Authenticated create and draft chat do not move a generation pointer; confirmation creates generation 1. |
| Revision | Chat on a ready battlefield creates a candidate while the exact current generation remains active; confirmation appends one generation. |
| Expiry and pointer drift | An expired upgrade activates nothing, and a stale revision cannot overwrite a concurrently advanced current generation. |
| Immutable image | Image generation receives only the V2 visual brief and appends one media revision; the same idempotency key appends none. |
| Explicit legacy upgrade | A legacy owner row stays unselectable during review and becomes ready generation 1 only after confirmation. |
| Selection and direct binding | Unsupported presets are visible in management but absent from `selectable=true`; policy generation and direct battle creation reject their IDs. |
| Exact battle binding | Battle start records exact preset generation ID/digest plus an immutable instance generation, invokes no legacy concretizer, and leaves the preset current pointer unchanged. |
| Explicit imports | Copy and save-from-battle each create a new ready logical preset at generation 1. |
| System/random pool | System seeds are deterministic explicit imports and only ready generations enter the random pool. |

## Regression anchors

- `packages/shared/src/structured-battlefield.test.ts` covers schema,
  deterministic compilation, projection non-leakage, claim receipts, and
  deterministic evolution selection.
- `backend/src/routes-structured-battlefield-acceptance.test.ts` exercises the
  authenticated HTTP surface against real SQLite persistence.
- `backend/src/services/battle-public.test.ts` covers live affordance selection
  and canonical environment-operation rejection.

## Validation

Run from the repository root:

```text
npm test
npm run typecheck
npm run build
perttool document check docs/structured-domain-assets.pert
git diff --check
```

Results:

- `npm test`: 505 tests passed
  - shared: 249;
  - backend: 238;
  - frontend: 15;
  - deployment worker: 3.
- `npm run typecheck`: passed for every workspace and the deployment worker.
- `npm run build`: passed for shared, backend, and frontend. Vite retained its
  existing non-blocking large-chunk warning.
- `perttool document check docs/structured-domain-assets.pert`: passed with
  existing milestone-acceptance advisory warnings.
- `git diff --check`: passed.

## Decision boundary

`SDA_BATTLEFIELD` is complete locally. The next PERT frontier is
`SDA_NARRATION`. This evidence does not authorize push, release, Stage,
production Promote, or bulk migration.
