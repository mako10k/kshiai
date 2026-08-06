# Battle Pipeline Projection PoC Evaluation

## Decision

```text
T_PROJECTION_EVAL: done
Decision: revise
```

The Projection PoC preserved every tested hard invariant and retained every
seeded decisive claim, but it did not achieve the frozen context-size reduction
threshold. The projection direction remains useful, especially at the
character observation boundary, but the server-side fact representation needs
a bounded revision before later PoC interventions are unblocked.

This decision does not claim that projected facts or resulting battles are
objectively correct.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Projection fixture](evidence/battle-pipeline-projection-fixtures-v1.json) | `bfe35ba94be209296f82e288c02fc68fbaf95589faca99e8450fd3695b898775` |
| [Projection evaluation](evidence/battle-pipeline-projection-eval-2026-08-06.json) | `a11e634446a8735c4d9465651a44028d08bab9fc24068b746b3bb56b265bdf3e` |
| Frozen baseline corpus | `c467fd9d3e76f4a72d09efe171ee36181ed468d9c883482436312ae77f9b9740` |
| Frozen baseline report | `1617cc68535ace9af570a826cee8a916075f81ee3200c4c03b51c8f76bf90e1b` |
| Projection implementation | `57880ebbb0beedfd186d5b4145fd80cd3ee61ee1112cb003fd4d24d337bcb337` |
| Evaluation harness | `1374eb4d974b68174906b5b3f8ee73b96337c4c0e245b1907d90dd4c6061700b` |

The fixture and harness were committed before the 20-repetition evidence run.
The report records clean-tree commit
`c2ef1bcd9267923865fae1d7d4823660c963cdc1` as its execution source.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Schema failures | 0 | 0 | pass |
| Source mutations | 0 | 0 | pass |
| Canonical identity leakage | 0 | 0 | pass |
| Observer-isolation violations | 0 | 0 | pass |
| Limit violations | 0 | 0 | pass |
| Baseline outcome mismatches | 0 | 0 | pass |
| Decisive-fact recall | 100% | at least 98% | pass |
| Weighted serialized-byte reduction | 4.71% | at least 30% | **fail** |
| Projection latency p95 | 2.60 ms | at most 25 ms | pass |

The run used six fixtures, 20 repetitions per fixture, and 120 projection
reads. The nine frozen local baseline scenario digests all remained unchanged.

## Fixture detail

| Fixture | Recall | Slice bytes | Reduction from BattleState |
|---|---:|---:|---:|
| ordinary adjudication | 100% | 14,084 | -10.13% |
| remote targeting | 100% | 14,892 | -15.33% |
| support propagation | 100% | 16,600 | -22.46% |
| committed communication | 100% | 15,683 | 6.79% |
| active world process | 100% | 14,941 | -15.02% |
| observer identity isolation | 100% | 2,231 | 83.14% |

The observation contract materially reduced input size while preserving the
seeded observer-local identity claim. The server-only contracts expanded most
fixtures because they encode the same current state into repeated fact
envelopes and retain overlapping mechanical, world, and semantic
representations.

## XAI decision

No XAI request was made.

The user authorized limited XAI use, but this intervention produces structured
slices with explicit seeded ground truth. Schema, identity isolation, exact
claim recall, bytes, outcomes, and latency were directly measurable. Adding an
LLM reviewer would not resolve the failed size metric and would introduce a
second, noisier judgment path. The report records zero external calls and the
reason for not using XAI.

## Bounded revision hypothesis

Retain the current observer-local observation boundary. Revise server-only
adjudication and consistency slices by:

1. deduplicating facts represented in both world and semantic state;
2. replacing one-envelope-per-field expansion with compact purpose-specific
   DTOs;
3. including canonical provenance or full fact envelopes only when the current
   consumer requires them;
4. preserving anchor, relation, process, and recent-causal recall while
   measuring the same frozen fixture unchanged.

This is a revision hypothesis, not authorization to implement it. The same
fixture and thresholds must be used for the comparison unless a new version is
explicitly frozen.

## Decision lock

`T_PATCH_POC` remains blocked. A completed evaluation with decision `revise`
does not satisfy the plan's continuation criterion. The next authorized action
is the explicit revision loop added in plan version 3:

1. `T_PROJECTION_REVISION_POC` (2p) compacts only server-side adjudication and
   consistency slices while preserving the existing observation boundary,
   decisive-fact recall, authority, privacy, and unchanged-outcome invariants.
2. `T_PROJECTION_REVISION_EVAL` (1p) repeats the frozen fixture, 20-repetition
   protocol, and thresholds without weakening them.

This plan change does not start implementation. `T_PATCH_POC` now depends on
`PROJECTION_REVISION_EVALUATED` and may be unblocked only if the revision result
is `supported`; any other verdict requires another explicit replan.

## Validation commands

```text
npm run eval:battle-pipeline-projection --workspace=backend -- \
  --output docs/evidence/battle-pipeline-projection-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-projection-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
