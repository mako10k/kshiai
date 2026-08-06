# Battle Pipeline Read Coherence PoC Evaluation

## Decision

```text
T_READ_EVAL: done
Decision: revise
```

The shadow read and repair prototype preserved every frozen hard invariant, but
failed causal selection safety. It produced locally coherent previews while
retaining a causally weaker fact in the frozen recency trap. Those previews are
counted as harm, not success. Later graph work remains blocked.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Read fixture](evidence/battle-pipeline-read-coherence-fixtures-v1.json) | `a08d3c2c30c6b3e422cad90773e9fe6531c025970a9a311327bfd03256a16454` |
| [Evaluation report](evidence/battle-pipeline-read-coherence-eval-2026-08-06.json) | `35f744b69dcbcba127729428570083dcdca99065feb5c3c044fdaec5f08c0bfb` |
| Read implementation | `b173ff4d419ab85e5022a82c1f58c4e91dac3cce4fb9ef08216263dd991aaada` |
| Evaluation harness | `2abd603d3ab7d0f192dbca936fc2fd151918f7f3a40bcff277d42eb038d0a479` |

The report records clean-tree commit
`4489fb37901390b832fd2eae1f7bd04c59dab777` as its execution source. It ran
20 repetitions over seven scenarios, for 140 scenario runs.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Conflict-detection recall | 100% | 100% | pass |
| False-conflict rate | 0% | 0% | pass |
| Blocking-conflict reduction | 80% | at least 75% | pass |
| Expected usable-read success | 100% | 100% | pass |
| Correct selection rate | 50% | 100% | **fail** |
| Incorrect fact selections | 20 | 0 | **fail** |
| Causal regressions | 20 | 0 | **fail** |
| Unnecessary repair rate | 0% | 0% | pass |
| Unknown fallback rate | 50% | at most 50% | pass |
| Out-of-scope mutations | 0 | 0 | pass |
| Public-history rewrites | 0 | 0 | pass |
| Source mutations | 0 | 0 | pass |
| Authority regressions | 0 | 0 | pass |
| Repeated-repair loops | 0 | 0 | pass |
| Limit violations | 0 | 0 | pass |
| External LLM calls | 0 | 0 | pass |
| p95 scenario latency | 3.187 ms | at most 50 ms | pass |

## Failure example

The recency-trap scenario supplied two incompatible position facts:

- `fact.position.causally-supported`: earlier, with a `modified` causal link;
- `fact.position.recent-weak`: later, with only a `created` link and repair
  provenance.

The current tuple ranks `validFrom` before causal-link strength, so all 20 runs
retained `fact.position.recent-weak`. The direct conflict disappeared and the
preview became locally coherent, but the frozen causal ground truth became
weaker. This is the exact failure mode the evaluation protocol excludes.

## Bounded revision

The plan adds a 1p `T_READ_REVISION_POC` and a separate 1p
`T_READ_REVISION_EVAL`:

- rank causal-link strength before bare recency;
- reject `select` when causal and authority order remains incomparable;
- keep all existing shadow, scope, history, fallback, and budget boundaries;
- re-run the unchanged seven-scenario, 20-repetition protocol.

This does not authorize the revision automatically. The revision PoC remains a
new decision lock.

## XAI decision

No XAI request was made. Conflict membership, causal-link priority, expected
retained facts, and fallback states are explicit structured ground truth. XAI
cannot offset the deterministic causal regression. The report records zero
external LLM calls.

## Velocity update

The completed Read cycle is 3p (`T_READ_POC` 2p plus `T_READ_EVAL` 1p) in one
observed workday. Applying the 50% smoothing rule to 2.25p/day gives
`(2.25 + 3) / 2 = 2.625p/day`. After adding the bounded 2p revision pair,
remaining conditional work is 16p, or approximately 6.10 days.

## Limitations

- The corpus covers direct structured slot conflicts, not arbitrary semantic
  contradictions.
- Frozen causal preference is explicit evaluator ground truth and does not
  generalize to every world rule.
- Latency is local process time and excludes persistence, network, and
  production contention.
- Unknown and weakened markers still have no runtime consumer semantics.
- Static authority scanning is not a whole-program capability proof.
- A future supported revision would remain bounded proxy evidence, not proof of
  global consistency or correct battle outcomes.

## Validation commands

```text
npm run eval:battle-pipeline-read --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-read-coherence-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-read-coherence-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-read-coherence-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
