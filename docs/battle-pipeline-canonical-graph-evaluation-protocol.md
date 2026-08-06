# Battle Pipeline Canonical Graph PoC Evaluation Protocol

## Frozen scope

- Task: `T_GRAPH_EVAL`
- Fixture: `evidence/battle-pipeline-canonical-graph-fixtures-v1.json`
- Repetitions: 20 per scenario
- Runtime authority: unchanged; the graph remains an in-memory read-only view
- Index maintenance mode: discard and full reconstruction only
- External LLM calls: zero
- XAI: not used because equality, ordering, reachability, cost, and authority
  claims are structured and deterministic

The corpus covers a pre-world legacy state, connected held object, active world
process, consistency issue, committed causal history, remote targeting, and a
patch read. Every scenario is projected once through the direct adapter and
once through the graph-backed adapter. A JSON round trip simulates restart;
reordered legacy maps and pair relations test insertion-order independence.

## Measures

| Measure | Frozen threshold | Purpose |
|---|---:|---|
| Projection fact equality | 100% | Preserve direct-adapter adjudication and consistency facts |
| Projection scope equality | 100% | Preserve bounded interaction selection |
| Projection causal equality | 100% | Preserve action/effect attribution after fact-ID normalization |
| Query claim recall | 100% | Exercise entity, fact, interaction, process, issue, and rule access |
| Ordering independence | 100% | Reconstruct one snapshot from equivalent legacy map orderings |
| Restart parity | 100% | Rebuild the same graph after a JSON serialize/parse cycle |
| Committed-outcome parity | 100% | Preserve deterministic next-turn actions, effects, and final state |
| Rollback success | 100% | Recover the unchanged direct path by discarding the graph |
| Patch-context recall | 100% | Resolve direct, inverse, retraction, slot, causal, issue, and rule context |
| Dual-representation serialized growth | at most 3.0x | Bound a hypothetical state-plus-snapshot migration cost |
| p95 graph query latency | at most 25 ms | Bound one indexed scope query |
| p95 reconstruction latency | at most 50 ms | Bound state-to-graph construction |
| p95 restart latency | at most 75 ms | Bound JSON parse plus reconstruction |
| p95 full-rebuild maintenance latency | at most 75 ms | Expose the cost of having no incremental update path |
| Graph source size | at most 900 lines | Bound implementation surface |
| Exported graph declarations | at most 20 | Bound public API surface |

Live heap delta is recorded as a diagnostic only. It is process-global and
garbage-collector dependent, so it is not a decision threshold. Serialized
growth is the stable memory/storage proxy: `(BattleState bytes + graph snapshot
bytes) / BattleState bytes`. This intentionally models the riskier temporary
dual-representation phase; the PoC does not persist either copy itself.

## Hard invariants

- no source-state mutation;
- no runtime backend/frontend/worker integration;
- no exported commit, persistence, or graph mutation API;
- no schema failure;
- no deterministic committed-outcome mismatch;
- no external LLM call.

The evaluator also reports index coverage and whether each component showed
bounded read value. Subject/inverse, causal, interaction, and issue indexes can
be candidates for an ephemeral view. Temporal buckets, process lists, rule
lists, and snapshot serialization remain derived unless separate evidence
justifies them. Passing query latency alone never supports independent graph
persistence.

## Decision rubric

- `unsupported`: a hard invariant, exact projection parity, committed outcome,
  or rollback requirement fails.
- `revise`: hard invariants hold, but query recall, restart/order parity,
  patch-read coverage, cost ceiling, or complexity ceiling misses its threshold.
- `supported`: every frozen invariant and effectiveness/cost threshold passes.
- `indeterminate`: the corpus does not exercise all required graph components,
  committed history, world process, consistency issue, and patch context.

`supported` means only that a discardable in-memory derived graph is useful for
the frozen cases. It does not support independent persistence, runtime wiring,
storage migration, global consistency, or objectively correct battle results.
