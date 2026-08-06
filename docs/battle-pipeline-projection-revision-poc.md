# Battle Pipeline Projection Revision PoC

## Status

- Task: `T_PROJECTION_REVISION_POC`
- State: built
- Date: 2026-08-06
- Authority: read-only prototype; not wired into battle resolution or commit
- Evaluation: pending (`T_PROJECTION_REVISION_EVAL` remains separate)

This revision addresses the failed serialized-byte reduction metric recorded by
the first projection evaluation. It does not change the frozen fixture,
thresholds, observer-facing projection, battle resolution, or canonical-write
authority.

## Revised server-only contract

`ObservationSlice` remains unchanged at schema version 1. Server-only
`AdjudicationSlice` and `ConsistencySlice` now use schema version 2.

The v2 representation removes duplicated `scope.factRefs` and
`scope.ruleRefs`. Facts are grouped once by canonical subject:

- adjudication groups contain compact `[predicate, objectRef, value?]` claims;
- consistency groups retain fact ID, validity, source, and optional value;
- consistency causal links retain source, target fact, and relation;
- full fact views are reconstructed only for code paths that need them.

Adjudication claims with the same subject, predicate, object, and value are
deduplicated because adjudication does not consume their provenance.
Consistency facts preserve distinct provenance for later audit and repair use.

## Purpose-scoped selection

The adapter starts from proposal or consistency anchors and active process
references. It retains:

- facts whose subject or object is a selected anchor or active process;
- the containing area or controller of a selected entity;
- inverse ownership, wear, and attachment dependencies;
- pair relations involving a retained reference;
- recent event facts and their causal links when they involve an anchor;
- scene-wide semantic facts and the applicable rule references.

This is still a deterministic interaction heuristic. It does not prove that an
unrepresented implicit dependency is irrelevant.

## Implementation checks

The one-repetition evaluator smoke check over the unchanged frozen fixture
reported:

- hard invariant failures: 0;
- decisive-fact recall: 1.0;
- weighted serialized-byte reduction: 0.663010;
- baseline outcome mismatches: 0;
- external LLM calls: 0.

The byte result is implementation feedback, not the formal effectiveness
decision. `T_PROJECTION_REVISION_EVAL` must rerun all 20 repetitions, record the
new evidence artifact, check latency and every hard invariant, and apply the
unchanged decision rubric. XAI is unnecessary for the current structured
claims; it may be used only if that evaluation encounters a genuinely semantic
ambiguity.

## Authority boundary

The adapter still snapshots `BattleState` and performs read-only projection.
It does not resolve actions, mutate the source state, commit facts, update
perception, call an LLM, or authorize `T_PATCH_POC`.
