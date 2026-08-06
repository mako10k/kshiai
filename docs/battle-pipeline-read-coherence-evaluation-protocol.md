# Battle Pipeline Read Coherence PoC Evaluation Protocol

## Frozen scope

- Task: `T_READ_EVAL`
- Fixture: `evidence/battle-pipeline-read-coherence-fixtures-v1.json`
- Repetitions: 20 per scenario
- Runtime authority: unchanged; repairs remain local shadow previews
- External LLM calls: zero
- XAI: not used because conflict membership, causal order, expected retained
  facts, and permitted fallback states are explicit structured ground truth

The frozen corpus includes a valid later causal selection, a recency trap where
the later fact is causally weaker, an ambiguous selection requiring unknown,
an already coherent read, a truncated slice, an out-of-scope reinterpretation,
and an attempt-cap boundary.

## Measures

| Measure | Frozen threshold | Purpose |
|---|---:|---|
| Conflict-detection recall | 100% | Expose every seeded direct conflict in complete slices |
| False-conflict rate | 0% | Keep coherent complete slices usable |
| Blocking-conflict reduction | at least 75% | Reduce bounded repairable blockers without hiding residual conflict |
| Expected usable-read success | 100% | Produce coherent or explicitly repaired reads for expected usable cases |
| Correct selection rate | 100% | Retain the frozen causally preferred fact whenever selection is used |
| Incorrect fact selections | 0 | Never prefer recency over stronger causal evidence |
| Causal regressions | 0 | Count a coherent but causally weaker result as harm |
| Unnecessary repair rate | 0% | Do not patch already coherent reads |
| Unknown fallback rate | at most 50% | Permit bounded degradation without making it the normal result |
| Out-of-scope mutations | 0 | Keep patch assertions and retractions inside checked facts and entities |
| Public-history rewrites | 0 | Preserve input validity/history and emit only patches |
| Source mutations | 0 | Leave source slices and facts unchanged |
| Authority regressions | 0 | Keep repair provenance and avoid runtime or persistence wiring |
| Repeated-repair loops | 0 | Do not repeat an equivalent patch or exceed planned attempts |
| Limit violations | 0 | Honor attempt, call, conflict, and touched-fact caps |
| External LLM calls | 0 | Keep this structured check deterministic |
| p95 scenario latency | at most 50 ms | Bound local preview overhead on the evaluation host |

## Decision rubric

- `unsupported`: source immutability, scope, history, authority, or configured
  limit invariants fail.
- `revise`: hard invariants hold, but detection, reduction, usable reads,
  selection, causal safety, unnecessary repair, fallback, loop, or latency
  misses a threshold.
- `supported`: every frozen invariant and effectiveness threshold passes.
- `indeterminate`: the corpus lacks conflict, coherent, selection, fallback,
  or incomplete-context cases needed for the decision.

A coherent preview does not count as success when it retains a fact that the
frozen causal ground truth marks weaker. A supported result would still be
bounded proxy evidence, not proof of global consistency or correct outcomes.
