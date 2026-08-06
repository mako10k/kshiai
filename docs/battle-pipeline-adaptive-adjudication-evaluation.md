# Battle Pipeline Adaptive Adjudication PoC Evaluation

## Decision

```text
T_ADAPTIVE_EVAL: done
Decision: supported
Scope: frozen shadow adaptive mechanism only
```

Every frozen hard invariant, deterministic effectiveness threshold, blind
semantic proxy threshold, and shadow cost/complexity ceiling passed. This
supports retaining `fast / coarse / expanded`, longest-prefix execution,
execution-derived costs, bounded world refinement, and safe degradation for the
next frozen PoC.

It does not establish an objectively correct battle result and does not support
runtime wiring, canonical commit, persistence, or production LLM generation.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Protocol](battle-pipeline-adaptive-adjudication-evaluation-protocol.md) | `c87786e228fdbfef5e7d0e9bb2f980b46ba1ad00fbd0002d02454ae8b7dcfb36` |
| [Fixture](evidence/battle-pipeline-adaptive-adjudication-fixtures-v1.json) | `f13b2f1def0de4fc6746cac4878dc33d66966246120cbf232b3921b1e3a0b2b7` |
| [Raw evaluation report](evidence/battle-pipeline-adaptive-adjudication-xai-2026-08-06.json) | `06935207075c933d66f224796aac0fc38f091a97f6fec6cfb9800022f86b3264` |
| Evaluation harness | `6025cca5f4e9ba46c6c3fe14600d8e175ad5c9ab207006ba5a7a1d38a9f9cf58` |
| Adaptive implementation | `62727eeb6188fe240aad3936aa8c13eaab687ad5dea0c1f483a580205c4198b0` |

The report records clean-tree commit
`f24e6dd54b9b963fe48844abcac57e01a5e4cd8a`. The protocol, fixture, and
evaluator were committed before the billed provider run.

## Deterministic results

Seven scenarios ran 20 times each. All 140 result digests were stable within
their scenario.

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Fast-path outcome parity | 1.00 | 1.00 | pass |
| Expansion-trigger precision | 1.00 | at least 0.80 | pass |
| Expansion-trigger recall | 1.00 | at least 0.80 | pass |
| Partial-prefix correctness | 1.00 | 1.00 | pass |
| Causal trace completeness | 1.00 | at least 0.98 | pass |
| Known-fact contradiction reduction | 1.00 (3 to 0) | at least 0.30 | pass |
| Unsupported-assertion reduction | 1.00 (4 to 0) | at least 0.30 | pass |
| Budget-degradation correctness | 1.00 | 1.00 | pass |
| p95 shadow latency | 0.986 ms | at most 25 ms | pass |
| Adaptive source size | 1,073 lines | at most 1,200 | pass |
| Exported declarations | 40 | at most 40 | pass |

Schema failure, source mutation, canonical commit, runtime integration,
adjudicator-invented tactic, incomplete-step cost, and shadow external LLM call
counts were all zero.

## Blind XAI rubric

XAI `grok-4-fast-non-reasoning` reviewed five semantic scenarios four times
each. Candidate order was reversed in pairs, so the adaptive result appeared as
A ten times and B ten times.

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Valid judgment coverage | 1.00 (20/20) | at least 0.90 | pass |
| Adaptive preference share | 0.95 | at least 0.60 | pass |
| Explanation-score delta | +2.95 | at least +0.25 | pass |
| Order-pair consistency | 0.80 | at least 0.75 | pass |
| Call errors | 0 | 0 required for full coverage | pass |

There were 18 adaptive preferences and two ties. Both ties occurred when the
adaptive simultaneous-conflict result appeared as candidate A; the reversed
orders preferred adaptive. The textual reasons still criticized the control's
unsupported side priority. This makes order consistency the weakest passing
metric and evidence of residual position/output variance, not a reason to
raise the score.

Judge cost was 20 calls, 15,088 input tokens, 2,592 output tokens, 17,680 total
tokens, 1,807.7 ms mean latency, and 2,243 ms p95. These are evaluation costs,
not battle-turn costs.

## Call-budget interpretation

The shadow adjudicator made no external LLM calls. The target contract remains
three ordinary-turn calls (A, B, narrator), with at most two additional calls
for a character plan and world detail on an expanded turn. The frozen harness
consumes pre-authored plans, coarse outcomes, and world refinements, so it does
not measure production generation tokens or expanded-path network latency.

Consequently, `supported` applies to routing and receipt semantics only. A
separate experiment is required before production integration can claim that
LLM-generated plans remain grounded or fit the call/token/latency budget.

## Decision lock

`ADAPTIVE_EVALUATED` is reached. The result supports a separately authorized
`T_WORLD_POC`, but does not start or unblock it automatically. The world-process
task remains blocked until explicit continuation.

## Velocity update

The bounded Adaptive cycle is 5p (`T_ADAPTIVE_POC` 3p and
`T_ADAPTIVE_EVAL` 2p) on one observed workday. Applying the existing 50%
smoothing rule gives `(3.15625 + 5) / 2 = 4.078125p/day`, represented as
`261p/64d`. Remaining conditional work is 5p, approximately 1.23 days. This is
still a low-confidence same-calendar-day estimate.

## Limitations

- The scenarios intentionally contrast safe adaptive behavior with explicit
  coarse failures; they do not estimate the prevalence of such cases in live
  battles.
- XAI is one automated semantic judge, not independent human consensus or an
  oracle.
- Four judgments per semantic scenario are enough for the frozen threshold but
  too small for a general population claim.
- Simultaneous-conflict review showed order-sensitive ties at the threshold's
  margin.
- Plans and refinements are pre-authored, so plan-generation quality and cost
  remain unknown.
- Local process latency excludes provider, persistence, concurrency, and
  production load.
- No production state, prompt, provider order, database, release, or deployment
  behavior changed.

## Validation commands

```text
npm run eval:battle-pipeline-adaptive --workspace=backend -- \
  --provider xai --execute \
  --output docs/evidence/battle-pipeline-adaptive-adjudication-xai-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-adaptive-adjudication-poc.test.ts \
  packages/shared/src/battle-adaptive-adjudication.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
perttool dag next docs/battle-pipeline-revision.pert --format json
```
