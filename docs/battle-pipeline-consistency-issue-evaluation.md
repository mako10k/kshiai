# Battle Pipeline Consistency Issue Lifecycle PoC Evaluation

## Decision

```text
T_ISSUES_EVAL: done
Decision: supported
```

The shadow issue-lifecycle prototype passed every frozen hard invariant and
effectiveness threshold. This supports retaining the Phase-3 contract for the
selected structured streams. It does not authorize canonical mutation,
persistence, runtime wiring, repair, or the next PoC.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Issue fixture](evidence/battle-pipeline-consistency-issue-fixtures-v1.json) | `be81734527a9b8a285f80af19a9237e6fc42aa2ecee5e980ee1000e0baf7139a` |
| [Evaluation report](evidence/battle-pipeline-consistency-issue-eval-2026-08-06.json) | `bf920df6add877cb7bb5f201333e59abaed258bd93fc5138a9cd3dd1e7ded911` |
| Issue implementation | `b29d715e45a744cc7cd679768542ea8227e238f7884f314adc9fec36f89e23d5` |
| Evaluation harness | `d7ada7525b96a278ea2fe930f7b2ae8a2f9db15d74946e9dd32c86d3574fd8f0` |

The report records clean-tree commit
`ae57d96f799f93b0aaefca6739abd570d48981b1` as its execution source. It ran
20 repetitions over three scenarios: 60 scenario runs, 240 true issue
observations, and 40 false-positive boundary inputs.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Issue-detection recall | 100% | 100% | pass |
| False-positive rate | 0% | 0% | pass |
| Duplicate-recognition recall | 100% | 100% | pass |
| Distinct-issue preservation | 100% | 100% | pass |
| Stale replay no-op accuracy | 100% | 100% | pass |
| Purpose-blocking accuracy | 100% | 100% | pass |
| Lifecycle traceability | 100% | 100% | pass |
| Actionable-issue rate | 100% | 100% | pass |
| Storage per unique issue | 773.9 bytes | at most 4,096 bytes | pass |
| Operator-review inflation | 1.0 | at most 1.0 | pass |
| Source mutations | 0 | 0 | pass |
| Authority regressions | 0 | 0 | pass |
| Global-coherence claims | 0 | 0 | pass |

## Scenario detail

| Scenario | Unique issues | Final unresolved | Bytes per issue | Key boundary |
|---|---:|---:|---:|---|
| Mixed alert lifecycle | 4 | 3 | 853.5 | duplicate, defer, resolve, and stale replay |
| Audit boundaries and ref-less findings | 3 | 3 | 646.0 | `no_issue_found` and `indeterminate` create no issue |
| Purpose isolation and stale status | 3 | 2 | 795.7 | unrelated purposes remain usable |

Deferred issues remained blocking only for their server-classified purposes;
resolved issues did not block. The registry never labeled the remaining world
globally coherent. Static checks found no runtime integration references and no
exported canonical write function.

## XAI decision

No XAI request was made. Conflict identity, duplicate relationships, lifecycle
transitions, and expected purpose classifications are explicit structured
ground truth in the frozen fixture. An external semantic judge would add a new
subjective path without resolving an unmeasured output. The evidence report
records zero external LLM calls.

## Velocity update

The completed Issues cycle is 2p (`T_ISSUES_POC` 1p plus `T_ISSUES_EVAL` 1p)
in one observed workday. Applying the 50% smoothing rule to the prior
2.5p/day gives `(2.5 + 2) / 2 = 2.25p/day`. Remaining conditional work is 17p,
or approximately 7.56 days at this low-confidence provisional velocity.

## Limitations and decision lock

- The frozen streams use explicit structured issue kinds and references; they
  do not measure contradiction discovery from arbitrary prose.
- Purpose classifications are frozen server-side ground truth for these cases,
  not evidence that an unimplemented classifier generalizes.
- Storage is measured on small in-memory envelopes and does not predict
  database indexes or retention cost.
- Review burden counts unresolved items, not human comprehension time or
  decision quality.
- Static source scanning is not a whole-program capability proof.
- `supported` does not prove global consistency or guarantee correct final
  battle results.

`T_READ_POC` remains blocked. Starting it requires separate explicit
authorization even though this evidence supports continuation.

## Validation commands

```text
npm run eval:battle-pipeline-issues --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-consistency-issue-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-consistency-issue-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-consistency-issue-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
