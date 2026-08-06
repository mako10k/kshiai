# Battle Pipeline Canonical Patch PoC Evaluation

## Decision

```text
T_PATCH_EVAL: done
Decision: supported
```

The bounded shadow-patch prototype passed every frozen hard invariant and
effectiveness threshold. This supports retaining the Phase-2 shadow contract
for the selected transitions. It does not authorize canonical commit,
persistence, runtime battle wiring, or the next PoC.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Patch fixture](evidence/battle-pipeline-patch-fixtures-v1.json) | `39530b6691e32f112cb90354f08f4a1ac2f4ebb86d302d9511c4932928806b29` |
| [Evaluation report](evidence/battle-pipeline-patch-eval-2026-08-06.json) | `e4a2a18895fcd2ee315c26f60f52936ac321c7dca8a049eb97db32c87d7f5d07` |
| Patch implementation | `45dc676e8d3f9c00b14c88bf4dba7483b87b47d6cf40557466931edd5221cabf` |
| Evaluation harness | `2899c393c63199cb0cddc9f45766d45966d6e6f89afe7a93d627d799e5fd01fc` |

The report records clean-tree commit
`d7a3b66e1bc1fa33be8503dd2568c9e022b57295` as its execution source. It ran
20 repetitions over six conversion fixtures and eleven defect seeds: 120
conversion attempts and 220 defect audits.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Conversion classification accuracy | 100% | 100% | pass |
| Reconstructed touched-state parity | 100% | 100% | pass |
| Causal-source parity | 100% | 100% | pass |
| Seeded-defect recall | 100% | 100% | pass |
| False rejection | 0 | 0 | pass |
| Unexplained state changes | 0 | 0 | pass |
| Authority regressions | 0 | 0 | pass |
| Source mutations | 0 | 0 | pass |
| Schema failures | 0 | 0 | pass |
| Patch limit violations | 0 | 0 | pass |
| Weighted audit-scope byte reduction | 71.87% | at least 30% | pass |

The two unsupported-boundary fixtures also classified correctly on all 40
runs: missing prior fact references and new world identities returned
`indeterminate` instead of inventing facts or identities.

## Conversion detail

| Fixture | Classification | State parity | Causal parity | Scope change |
|---|---:|---:|---:|---:|
| Mechanical parameter change | 100% | 100% | 100% | 88.28% smaller |
| Semantic visible condition | 100% | 100% | 100% | 42.81% smaller |
| World placement and five pair relations | 100% | 100% | 100% | 6.49% larger |
| Accepted free action | 100% | 100% | 100% | 66.11% smaller |
| Missing prior fact | 100% `indeterminate` | N/A | N/A | N/A |
| New world identity | 100% `indeterminate` | N/A | N/A | N/A |

The world fixture is the important adverse result. Its patch repeats assertion,
retraction, causal, provenance, and touched-reference envelopes for six linked
facts, making this bounded audit input slightly larger than the authoritative
fixture input. The weighted aggregate still passes because the other selected
transitions shrink materially. This is evidence to consider compact relation
encoding later; it is not authority to change the accepted Patch contract now.

## Audit and authority detail

All eleven frozen seeds returned their expected issue code and verdict in all
220 audits. This includes explicit `indeterminate` for incomplete context,
which remains distinct from `no_issue_found`. Valid converted patches had zero
false rejection in complete contexts.

Every assertion retained its originating subsystem authority. Static checks
found no runtime integration references and no exported commit function. The
evaluation made no persistence write and did not execute the battle-service
path.

## XAI decision

No XAI request was made. The expected claims, causal sources, authority owners,
and injected defects are explicit structured ground truth. XAI would add a
second subjective judgment path without resolving an unmeasured semantic
ambiguity. The evidence report records zero external LLM calls.

## Velocity update

The completed Patch cycle is 3p (`T_PATCH_POC` 2p plus `T_PATCH_EVAL` 1p) in
one observed workday. Applying the frozen 50% smoothing rule to the prior
2p/day gives `(2 + 3) / 2 = 2.5p/day`. Remaining conditional work is 19p, or
7.6 days at this provisional velocity.

## Limitations and decision lock

- The corpus covers four converted transition shapes and two unsupported
  boundaries, not every existing operation or implicit relation.
- Seeded-defect recall does not measure contradictions outside implemented
  issue categories.
- Serialized-byte reduction is a scope proxy, not proof that omitted facts are
  irrelevant.
- Static source scanning is not a whole-program capability proof.
- `supported` does not guarantee global consistency or objectively correct
  battle results.

`T_ISSUES_POC` remains blocked. Starting it requires a separate explicit
authorization even though the Patch evidence supports continuation.

## Validation commands

```text
npm run eval:battle-pipeline-patch --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-patch-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-patch-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-canonical-patch-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
