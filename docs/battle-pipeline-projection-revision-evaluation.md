# Battle Pipeline Projection Revision Evaluation

## Decision

```text
T_PROJECTION_REVISION_EVAL: done
Decision: supported
```

The compact server-side Projection revision passed every frozen hard invariant,
quality proxy, and cost ceiling. This supports continuing the PoC sequence with
the bounded Projection contract. It does not prove that every omitted implicit
dependency is irrelevant or that a final battle result is objectively correct.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Unchanged projection fixture](evidence/battle-pipeline-projection-fixtures-v1.json) | `bfe35ba94be209296f82e288c02fc68fbaf95589faca99e8450fd3695b898775` |
| [Revision evaluation](evidence/battle-pipeline-projection-revision-eval-2026-08-06.json) | `e4a64f01e4fe76e298cfa8612b8197cd482fd2cb27c497f70e8935d8d24ccdbe` |
| Frozen baseline corpus | `c467fd9d3e76f4a72d09efe171ee36181ed468d9c883482436312ae77f9b9740` |
| Frozen baseline report | `1617cc68535ace9af570a826cee8a916075f81ee3200c4c03b51c8f76bf90e1b` |
| Projection implementation | `47b96068f948704221b18054fa3fb6eccbdcf6f536ce6d232456e3bee156e6a4` |
| Evaluation harness | `9bae447717699adee778fda8d37bbe36ec69332a953a2437fa2b864be7f83bf4` |

The report records clean-tree commit
`55600341a32734885c2684ea0564e11190fd1a60` as its execution source. The
fixture, corpus, baseline report, repetitions, limits, thresholds, and decision
rubric are unchanged from the first evaluation.

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
| Weighted serialized-byte reduction | 66.30% | at least 30% | pass |
| Projection latency p95 | 2.65 ms | at most 25 ms | pass |

The run used six fixtures, 20 repetitions per fixture, and 120 projection
reads. All nine frozen local baseline scenario digests remained unchanged.

## Fixture detail

| Fixture | Recall | Slice bytes | Reduction from BattleState |
|---|---:|---:|---:|
| ordinary adjudication | 100% | 3,638 | 71.55% |
| remote targeting | 100% | 3,846 | 70.22% |
| support propagation | 100% | 6,423 | 52.62% |
| committed communication | 100% | 7,716 | 54.14% |
| active world process | 100% | 3,882 | 70.12% |
| observer identity isolation | 100% | 2,231 | 83.14% |

The original representation reduced weighted bytes by 4.71%. The compact
revision reduced them by 66.30% while retaining every seeded anchor, relation,
process, and recent-causal claim. This is evidence for the frozen corpus only;
it is not a complete dependency-recall proof.

## XAI decision

No XAI request was made. Every scored output is structured, the decisive claims
are explicit, and all failures and thresholds are deterministic. An LLM review
would not resolve an unmeasured semantic ambiguity in this run and would add a
second judgment path. The evidence report records zero external calls.

## Limitations and decision lock

- Seeded recall does not cover every implicit dependency expressible in prose.
- Serialized-byte reduction is a context-size proxy, not proof that every
  omitted fact is irrelevant.
- Latency is machine-specific and is evaluated only against the frozen local
  ceiling.
- The adapter remains read-only and is not wired into live prompts or canonical
  mutation.
- A `supported` proxy decision does not guarantee correct adjudication or
  narration.

`T_PATCH_POC` remains blocked after this evaluation. The evidence now satisfies
its Projection prerequisite, but starting the next intervention requires an
explicit unblock and does not inherit authority to change canonical state.

## Validation commands

```text
npm run eval:battle-pipeline-projection --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-projection-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-projection-revision-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-projection-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
