# Battle Pipeline Read Coherence Revision Evaluation

## Decision

```text
T_READ_REVISION_EVAL: done
Decision: supported
```

The bounded causal-order revision passed every frozen hard invariant and
effectiveness threshold. In particular, the recency trap now retains the fact
with stronger causal support instead of the newer, causally weaker repair fact.
This is evidence for continuing to the separately authorized graph PoC; it is
not proof of globally consistent or objectively correct battle outcomes.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Read fixture](evidence/battle-pipeline-read-coherence-fixtures-v1.json) | `a08d3c2c30c6b3e422cad90773e9fe6531c025970a9a311327bfd03256a16454` |
| [Revision evaluation report](evidence/battle-pipeline-read-coherence-revision-eval-2026-08-06.json) | `2680b48e5c70570fd7cdbbde34ec1b70902f210ae868f7cc8b2d3e2f2cede00e` |
| Revised read implementation | `d9caa19f47f6d702cec180ad6dee9d50493f8a8fdd3f82c0b18efa8e9741203d` |
| Evaluation harness | `2abd603d3ab7d0f192dbca936fc2fd151918f7f3a40bcff277d42eb038d0a479` |

The report records clean-tree commit
`da58ff1c18ff0a80b2cce514af2c9fb1ee7b0146` as its execution source. The
fixture and evaluator hashes match the failed evaluation exactly, so only the
bounded read implementation changed. The run repeated all seven scenarios 20
times, for 140 scenario runs.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Conflict-detection recall | 100% | 100% | pass |
| False-conflict rate | 0% | 0% | pass |
| Blocking-conflict reduction | 80% | at least 75% | pass |
| Expected usable-read success | 100% | 100% | pass |
| Correct selection rate | 100% | 100% | pass |
| Incorrect fact selections | 0 | 0 | pass |
| Causal regressions | 0 | 0 | pass |
| Unnecessary repair rate | 0% | 0% | pass |
| Unknown fallback rate | 50% | at most 50% | pass |
| Out-of-scope mutations | 0 | 0 | pass |
| Public-history rewrites | 0 | 0 | pass |
| Source mutations | 0 | 0 | pass |
| Authority regressions | 0 | 0 | pass |
| Repeated-repair loops | 0 | 0 | pass |
| Limit violations | 0 | 0 | pass |
| External LLM calls | 0 | 0 | pass |
| p95 scenario latency | 2.693 ms | at most 50 ms | pass |

## Effect of the revision

| Measure | Before | After | Interpretation |
|---|---:|---:|---|
| Correct selection rate | 50% | 100% | frozen causal preference is retained |
| Incorrect fact selections | 20 | 0 | observed selection harm removed |
| Causal regressions | 20 | 0 | recency no longer overrides stronger causal evidence |
| Blocking-conflict reduction | 80% | 80% | prior conflict-reduction value preserved |
| Unknown fallback rate | 50% | 50% | fail-closed behavior preserved |

The before/after comparison is controlled by identical fixture, evaluator,
thresholds, scenario count, and repetitions. It supports the specific ranking
revision. It does not establish that the fixture covers all semantic conflict
forms, and the small latency change is not treated as a causal performance
claim.

## XAI decision

No XAI request was made. Conflict membership, causal preference, expected
selection, and fallback states are frozen structured ground truth. The report
records zero external LLM calls.

## Decision lock

`READ_COHERENCE_REVISION_EVALUATED` is reached. `T_GRAPH_POC` remains blocked
and unstarted until separately authorized. A later authorization may use this
supported result to open the graph decision gate; this evaluation does not open
it automatically.

## Limitations

- The corpus covers direct structured slot conflicts, not arbitrary semantic
  contradictions.
- Frozen causal preference is explicit evaluator ground truth and does not
  generalize to every world rule.
- Latency is local process time and excludes persistence, network, and
  production contention.
- One full-suite validation run exceeded the evaluator's wall-clock latency
  threshold; an unchanged rerun passed all 323 tests. The isolated formal run
  measured 2.693 ms p95, so latency remains environment-sensitive evidence.
- Unknown and weakened markers still have no runtime consumer semantics.
- Static authority scanning is not a whole-program capability proof.
- The supported decision is bounded proxy evidence, not a guarantee of correct
  final battle results.

## Validation command

```text
npm run eval:battle-pipeline-read --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-read-coherence-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-read-coherence-revision-eval-2026-08-06.json
```
