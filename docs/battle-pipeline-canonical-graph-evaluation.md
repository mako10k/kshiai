# Battle Pipeline Canonical Graph PoC Evaluation

## Decision

```text
T_GRAPH_EVAL: done
Decision: supported
```

The canonical graph PoC passed every frozen hard invariant, parity,
effectiveness, cost, and complexity threshold. This supports retaining a
discardable in-memory graph as a derived read view for the frozen scenarios.
It does not support independent graph persistence, runtime wiring, or migration
away from `BattleState`.

## Frozen evidence

| Artifact | SHA-256 |
|---|---|
| [Graph fixture](evidence/battle-pipeline-canonical-graph-fixtures-v1.json) | `7d68ff75f3e476d0a02b235065df80c5bfd2248384aaf0a9cd611791530ebc09` |
| [Evaluation report](evidence/battle-pipeline-canonical-graph-eval-2026-08-06.json) | `e7b0def3d86ac8eace634d0b36fe37fa403551e3b987a4dece00e615c1a63c7a` |
| Graph implementation | `d6405a2d13ea28e4fb7146918c43a4d290de761dddd640b7cb0e0f6909dabd36` |
| Projection implementation | `c8e3224987f091d0be6a3ba64fe1ee112264b2cb6682cdca60bddab2f97ac150` |
| Evaluation harness | `9bf838063ef7db732d9c857cf3ef33857ba5b3c21acdecb34600b43f63dbb5e7` |

The report records clean-tree commit
`85115eb104a7b2d8980fc9271abb295502a5693d` as its execution source. It ran
20 repetitions over four scenarios: 80 scenario runs, 320 graph
reconstructions, 80 graph queries, and 480 projection comparisons.

## Result against frozen thresholds

| Measure | Result | Threshold | Status |
|---|---:|---:|---|
| Projection fact equality | 100% | 100% | pass |
| Projection scope equality | 100% | 100% | pass |
| Projection causal equality | 100% | 100% | pass |
| Query claim recall | 100% | 100% | pass |
| Ordering independence | 100% | 100% | pass |
| Restart parity | 100% | 100% | pass |
| Committed-outcome parity | 100% | 100% | pass |
| Rollback success | 100% | 100% | pass |
| Patch-context recall | 100% | 100% | pass |
| Maximum dual-representation serialized growth | 2.114x | at most 3.0x | pass |
| p95 graph-query latency | 1.009 ms | at most 25 ms | pass |
| p95 graph reconstruction latency | 1.879 ms | at most 50 ms | pass |
| p95 restart latency | 4.234 ms | at most 75 ms | pass |
| p95 full-rebuild maintenance latency | 1.886 ms | at most 75 ms | pass |
| Graph implementation size | 785 lines | at most 900 lines | pass |
| Exported graph declarations | 17 | at most 20 | pass |
| Schema failures | 0 | 0 | pass |
| Source mutations | 0 | 0 | pass |
| Runtime integration references | 0 | 0 | pass |
| Exported mutation-authority APIs | 0 | 0 | pass |
| Committed-outcome mismatches | 0 | 0 | pass |
| External LLM calls | 0 | 0 | pass |

The maximum serialized growth occurred in the connected process-and-issue
scenario. The 2.114x value models temporary dual representation by adding the
serialized graph snapshot to the serialized `BattleState`; the PoC does not
actually persist that duplicate representation.

Heap delta was recorded only as a diagnostic. Per-scenario means ranged from
approximately 0.36 MB to 1.25 MB per graph on this process, but allocation and
garbage-collection noise make those values unsuitable as pass/fail evidence.

## Component assessment

The frozen reads show bounded value for:

- entity identity and subject/inverse fact lookup;
- causal lookup by source and target fact;
- interaction adjacency traversal;
- purpose-scoped issue lookup;
- bounded patch context lookup.

The following remain derived views rather than independent stored authority:

- temporal turn views;
- active world-process reference lists;
- rule-reference lists;
- the serialized graph snapshot itself.

The only tested index-maintenance strategy is discard and full reconstruction.
The PoC exposes no incremental mutation API. Its low local rebuild latency does
not establish production behavior under persistence, concurrency, larger
histories, or process contention.

## XAI decision

No XAI request was made. Fact equality, causal normalization, reachability,
ordering, restart, rollback, authority, and cost checks all have frozen
structured ground truth. The report records zero external LLM calls.

## Decision lock

`GRAPH_EVALUATED` is reached. The supported result permits a separately
authorized adaptive-adjudication PoC, but does not start it automatically.
`T_ADAPTIVE_POC` remains blocked until that authorization.

## Velocity update

The bounded Graph cycle is 4p (`T_GRAPH_POC` 2p plus `T_GRAPH_EVAL` 2p) in one
observed workday. Applying the 50% smoothing rule to 2.3125p/day gives
`(2.3125 + 4) / 2 = 3.15625p/day`, represented as `101p/32d`. Remaining
conditional work is 10p, or approximately 3.17 days. This remains a
low-confidence same-calendar-day estimate.

## Limitations

- The corpus covers four structured scenarios, not arbitrary future battle
  sizes, histories, semantic facts, or issue topologies.
- Projection equality shows parity with the current direct adapter, not that
  either representation contains every fact needed for every future purpose.
- Committed-outcome parity shows non-interference for deterministic frozen
  turns; it does not prove that the outcomes are plausible or objectively
  correct.
- Latency is local process time and excludes network, persistence, multi-process
  contention, and production load.
- Static authority scans are not a whole-program capability proof.
- Passing these proxies does not authorize persistent canonical-graph storage,
  runtime integration, migration, release, or deployment.

## Validation note

After the Graph evaluator became a tracked file, the historical consistency-
issue evaluator's static scan initially classified its fixture-only
`registerConsistencyAlert` call as runtime integration. The scanner allowlist
was extended for this exact offline evaluator path. No runtime source, frozen
Graph fixture, Graph evaluator, graph implementation, or formal report was
changed; the hashes above therefore remain the evaluated inputs.

## Validation commands

```text
npm run eval:battle-pipeline-graph --workspace=backend -- \
  --fixtures docs/evidence/battle-pipeline-canonical-graph-fixtures-v1.json \
  --repetitions 20 \
  --output docs/evidence/battle-pipeline-canonical-graph-eval-2026-08-06.json
node --import tsx --test \
  backend/src/scripts/evaluate-battle-canonical-graph-poc.test.ts
npm test
npm run typecheck
npm run build
perttool document check docs/battle-pipeline-revision.pert --format json
perttool dag analyze docs/battle-pipeline-revision.pert --format json
```
