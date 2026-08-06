# Battle Pipeline Read Coherence Causal-order Revision PoC

## Status

- Task: `T_READ_REVISION_POC`
- State: built and construction-validated
- Date: 2026-08-06
- Estimate: 1p
- Forecast velocity: 2.625p/day
- Forecast duration: approximately 0.38 day
- Authority: unchanged shadow-only boundary
- Evaluation: pending (`T_READ_REVISION_EVAL` remains separate)

This revision changes only `select` ranking in
`packages/shared/src/battle-read-coherence.ts`. The frozen evaluation found that
bare `validFrom` recency could outrank stronger causal evidence and produce a
locally coherent but causally weaker preview.

## Revised selection rule

Candidate facts are now compared in this order:

1. causal-link strength: `modified`, `triggered`, `created`, then `ended`;
2. provenance authority: deterministic, validated, free-action, then repair.

`validFrom` recency is no longer a selection rank. If the highest candidates
remain tied after causal strength and authority, `select` is rejected and the
caller may explicitly choose a lower-information fallback. This prevents a
newer weak claim from winning solely because it is newer.

## Preserved boundaries

- The frozen seven-scenario fixture, thresholds, and evaluator are unchanged.
- All five repair strategies and their schemas remain unchanged.
- Repairs still require a complete purpose slice and explicit enablement.
- Patch audit, scope, history, authority, attempt, call, and touched-fact bounds
  remain unchanged.
- No canonical commit, issue-registry mutation, persistence, or runtime battle
  wiring is added.

## Construction evidence

The shared regression suite now covers both directions:

- a later fact with a stronger `modified` causal link is selected;
- an earlier causally stronger fact is retained over a newer `created` repair
  fact;
- facts with equal causal and authority ranks remain rejected even when their
  `validFrom` values differ.

These tests show the bounded code path was revised. They are not the formal
effectiveness decision. `T_READ_REVISION_EVAL` must re-run the unchanged frozen
20-repetition protocol before graph work can be considered.
