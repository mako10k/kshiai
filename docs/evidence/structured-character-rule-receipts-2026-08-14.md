# Structured character deterministic rule receipt evidence

- Date: 2026-08-14
- Authority: ADR-0011 (`Accepted`)
- PERT task: `SDA_CHARACTER` (`active`)
- Scope: local implementation and verification only
- Excluded: deployment, release, bulk migration, and production operations

## Achieved in this slice

- Added a versioned server-side character action-norm compiler and evaluator.
  Predicate kinds and values use a closed registry; unsupported values fail
  authoring validation instead of becoming prompt-interpreted conditions.
- Added deterministic force, priority, predicate-specificity, and stable-ID
  ordering. Equal-rank contradictions with the same static activation contract
  fail definition validation.
- Intersected applicable constraints with the already server-proved legal action
  set. A runtime empty intersection records `character_norm_conflict` and selects
  the highest-ranked declared fallback only when it is currently legal, otherwise
  the currently legal `wait` action. No rule makes an illegal action available.
- Added bounded action-norm receipts for applicable, excepted, constraining,
  excluded, ranked, and fallback identities. Receipts are retained in the
  internal turn pipeline and later sequential-bucket checkpoint.
- Added a versioned relationship-seed resolver. Exact logical character asset ID
  outranks a registered role, then priority and stable seed ID resolve. Display
  name matching is absent. New battles freeze the selected seed and its receipt.
- Connected the selected relationship dynamics only to the deterministic psyche
  calculation. Deep-psyche and conscious-self consumers receive separately
  bounded descriptive projections without the counterpart asset ID or numeric
  dynamics; authored self-awareness gates the conscious projection.
- Provider inputs receive the filtered legal-action list and only applicable
  conscious principle text. Norm IDs, seed IDs, priorities, conflict details,
  and receipts remain server-internal.
- Added exact fallback, legal-wait fallback, exception, closed predicate,
  priority, exact-target/role, no-name-match, provider non-leakage, persistence,
  and A/B swap regressions.

## Verification

Run from the repository root:

```text
npm test
npm run typecheck
npm run build
git diff --check
```

Results:

- shared: 242 tests passed;
- backend: 220 tests passed;
- frontend: 15 tests passed;
- deployment contract: 3 tests passed;
- all workspace type checks and builds passed;
- patch whitespace validation passed.

## Remaining `SDA_CHARACTER` acceptance scope

This slice closes the first unmet item in the 2026-08-13 checkpoint, but it does
not finish `SDA_CHARACTER`. Remaining work is:

1. prove authoring-attempt expiry, concurrent current-pointer drift, provider
   partial failure, route-level selector exclusion, and direct-battle rejection;
2. remove the remaining legacy draft and direct-mutation fallbacks only after the
   V2 authoring path has equivalent regression coverage.

## Next frontier

The next coherent slice is the authoring and route-level integration acceptance
matrix. It should prove failure/expiry/concurrency behavior and every server-side
selection boundary before any legacy fallback is removed. Production Promote for
v0.18.0 remains a separate protected decision and is not authorized here.
