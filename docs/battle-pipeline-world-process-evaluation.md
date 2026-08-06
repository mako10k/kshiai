# Battle Pipeline Active World Process PoC Evaluation

## Decision

```text
T_WORLD_EVAL: done
Decision: supported
Scope: frozen shadow active-world-process mechanism only
```

Every frozen hard invariant, deterministic effectiveness threshold, blinded
semantic proxy threshold, and shadow cost/complexity ceiling passed. This
supports retaining rule-based active world proposals, bounded propagation,
same-window conflict routing, and causal shadow patches for the final PoC
evidence synthesis.

It does not establish an objectively correct battle result and does not support
runtime wiring, canonical commit, persistence, recursive process simulation, or
production LLM concretization.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Protocol](battle-pipeline-world-process-evaluation-protocol.md) | `482652b48961f5df2a7fbd6ecda7bd3c29f30cb3389bbb76b1652f0531667489` |
| [Fixture](evidence/battle-pipeline-world-process-fixtures-v1.json) | `5418edaa89734120ce317914a7079aa600be391c24a045c594805938308603fa` |
| [Raw evaluation report](evidence/battle-pipeline-world-process-xai-2026-08-06.json) | `b51f66b04ba5aeeacde0043a376ede8191da8f16d0757fbba16f2dd539873f87` |
| Evaluation harness | `4b5b9a1e0d526444c3b24d3ee67002fed9ee76b39a03aa776b847f0c38b9f7cc` |
| World-process implementation | `ae57bba547d6fb89d95e10387b68eaec7c876169ff51f4d7bd5dfb9c4f261fb0` |

The raw report records clean-tree commit
`37caebdb765a0ac43bbcd44583733c1d2f2bd064`. The protocol, fixture, thresholds,
and evaluator were committed before the billed provider run.

## Deterministic results

Nine scenarios ran 20 times each. All intervention and no-active-process
control digests were stable within their scenario.

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Expected process progression recall | 1.00 | 1.00 | pass |
| Trigger decision precision | 1.00 | 1.00 | pass |
| Trigger decision recall | 1.00 | 1.00 | pass |
| Propagation target coverage | 1.00 | 1.00 | pass |
| Character-process conflict handling | 1.00 | 1.00 | pass |
| Causal trace completeness | 1.00 | at least 0.98 | pass |
| Expected progression gain over baseline | 1.00 | at least 0.80 | pass |
| A/B swap symmetry | 1.00 | 1.00 | pass |
| Same-bucket atomicity | 1.00 | 1.00 | pass |
| Terminal behavior correctness | 1.00 | 1.00 | pass |
| p95 shadow latency | 0.780 ms | at most 25 ms | pass |
| World-process source size | 475 lines | at most 650 | pass |
| Exported declarations | 16 | at most 20 | pass |

Schema failures, source mutations, canonical commits, runtime integration
references, unsupported environmental inventions, shadow external LLM calls,
and modeled world-process added turn calls were all zero.

The no-active-process control intentionally emitted no environmental proposal.
The measured gain therefore establishes continuity value only when the frozen
trigger, target, and rule are already supplied; it does not measure the quality
of discovering active processes from arbitrary world state or prose.

## Blinded XAI rubric

XAI `grok-4-fast-non-reasoning` reviewed five semantic scenarios four times
each. Candidate order was reversed in pairs, so the active-process result
appeared as A ten times and B ten times.

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Valid judgment coverage | 1.00 (20/20) | at least 0.90 | pass |
| Active-process preference share | 1.00 | at least 0.60 | pass |
| Plausibility-score delta | +3.30 | at least +0.25 | pass |
| Continuity-score delta | +3.35 | at least +0.25 | pass |
| Order-pair consistency | 1.00 | at least 0.75 | pass |
| Call errors | 0 | 0 required for full coverage | pass |

Judge cost was 20 calls, 17,468 input tokens, 2,297 output tokens, 19,765 total
tokens, 2,030.85 ms mean latency, and 2,892 ms p95. These are evaluation costs,
not battle-turn costs.

The judge strongly preferred continuity over the deliberately inactive control.
In three same-window reviews it also labeled control omission as one
"unsupported invention" even though the control emitted no environmental
claim. That field is not used for the hard invention metric; inventions are
checked deterministically against the frozen effect slots. The semantic score
therefore remains useful as a plausibility proxy but should not be treated as an
independent factual audit.

## Call-budget interpretation

The shadow evaluator observed zero external LLM calls in every world-process
result. The modeled ordinary-turn budget remains the required character A,
character B, and narrator calls, with zero additional calls for the rule-based
world scenarios. The one ambiguous scenario uses a pre-authored bounded
concretization; production concretization generation quality, tokens, latency,
and failure behavior remain unmeasured.

## Decision lock

`WORLD_PROCESS_EVALUATED` is reached. The supported result satisfies the input
evidence for a separately authorized `T_SYNTHESIS`; it does not start synthesis,
runtime integration, persistence migration, release, or deployment by itself.

## Velocity update

The bounded World Process cycle is 3p (`T_WORLD_POC` 2p and `T_WORLD_EVAL` 1p)
on one observed workday. Applying the existing 50% smoothing rule gives
`(4.078125 + 3) / 2 = 3.5390625p/day`, represented as `453p/128d`.
The remaining `T_SYNTHESIS` task is 2p, approximately 0.57 day. This remains a
low-confidence same-calendar-day estimate.

## Limitations

- The rules, trigger facts, targets, character claims, and concretization are
  pre-authored and do not represent an open-world distribution.
- The control is deliberately inactive, so semantic preference does not isolate
  every possible benefit or harm of a more capable environmental engine.
- One process reads one frozen projection; effects do not recursively trigger a
  second process inside the same call.
- Same-window conflicts are detected and routed onward, not resolved here.
- XAI is one automated proxy reviewer, not independent human consensus or an
  oracle.
- Local latency excludes provider, persistence, concurrency, and production
  load.
- No production state, prompt, provider order, database, release, or deployment
  behavior changed.

## Validation commands

```text
npm run eval:battle-pipeline-world --workspace=backend -- \
  --provider xai --execute \
  --output docs/evidence/battle-pipeline-world-process-xai-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-world-process-poc.test.ts \
  packages/shared/src/battle-world-process-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert \
  --warnings-as-errors --format json
perttool dag analyze docs/battle-pipeline-revision.pert \
  --warnings-as-errors --format json
perttool dag next docs/battle-pipeline-revision.pert \
  --warnings-as-errors --format json
perttool plan-assurance show docs/battle-pipeline-revision.pert \
  --warnings-as-errors --format json
```
