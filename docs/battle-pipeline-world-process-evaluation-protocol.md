# Battle Pipeline Active World Process Evaluation Protocol

## Scope and comparison

This protocol evaluates only the frozen `shadow_world_process_poc` boundary.
The intervention is rule-based active world proposals in the character proposal
time window. The control is the same projected state and character proposals
with `activeProcesses=[]`. Neither candidate may commit canonical state.

The experiment can show that the bounded mechanism preserves environmental
continuity and interaction information better than the no-active-process
control. It cannot prove that a final battle result is objectively correct or
that the mechanism is ready for runtime integration.

## Frozen corpus

The fixture contains nine scenarios and runs every deterministic scenario 20
times:

- active fire and support-loss progression;
- multi-target smoke propagation;
- a fall process contested by a character action in the same time bucket;
- A/B actor-label swap symmetry for that contest;
- a character action in a different time bucket;
- bounded unknown-to-known smoke concretization;
- inactive and missing-trigger terminal behavior;
- missing-rule, out-of-scope, and invalid-concretization rejection.

Five scenarios receive four blinded semantic comparisons each. Candidate order
alternates in pairs. The reviewer sees the frozen context and two structured
results, but not which one is the intervention.

## Hard invariants

All must pass:

| Measure | Threshold |
|---|---:|
| Schema failures | 0 |
| Source mutations | 0 |
| Canonical commits | 0 |
| Runtime integration references | 0 |
| Unsupported environmental inventions | 0 |
| A/B swap symmetry | 1.00 |
| Same-bucket atomicity | 1.00 |
| Terminal and fail-closed behavior | 1.00 |
| Result digest stability | one digest per scenario |

An environmental claim is supported only when its target, predicate, value,
rule, process, trigger, and causal links match the frozen fixture and supplied
projection. A contested process must emit no patch. Rejected terminal and
invalid inputs must emit neither proposals nor effects.

## Deterministic effectiveness and cost thresholds

| Measure | Threshold |
|---|---:|
| Expected process progression recall | 1.00 |
| Trigger decision precision | 1.00 |
| Trigger decision recall | 1.00 |
| Propagation target coverage | 1.00 |
| Character-process conflict handling | 1.00 |
| Causal trace completeness | at least 0.98 |
| Expected progression gain over no-active baseline | at least 0.80 |
| Shadow external LLM calls | 0 |
| World-process added turn calls | 0 |
| p95 shadow latency | at most 25 ms |
| World-process source size | at most 650 lines |
| Exported declarations | at most 20 |

The baseline gain denominator contains only effects expected from valid active
processes. It does not reward inventions or count intentionally rejected input.
Provider calls made by the blinded evaluator are reported separately and are
not battle-turn calls.

## Blinded semantic proxy

| Measure | Threshold |
|---|---:|
| Valid judgment coverage | at least 0.90 |
| Active-process preference share | at least 0.60 |
| Plausibility score delta | at least +0.25 |
| Continuity score delta | at least +0.25 |
| Order-pair consistency | at least 0.75 |

Ties contribute one half to preference share. `indeterminate` and invalid
responses do not contribute to semantic scores but reduce coverage. The judge
must not reward verbosity and may not invent facts outside the supplied
context. XAI is a proxy reviewer, not a correctness oracle.

## Decision rubric

- `unsupported`: any hard invariant fails.
- `indeterminate`: semantic evaluation is absent or valid coverage is below the
  frozen threshold.
- `supported`: every hard invariant, deterministic effectiveness threshold,
  semantic proxy threshold, and cost ceiling passes.
- `revise`: hard invariants hold and semantic coverage is sufficient, but one
  or more effectiveness, semantic, or cost thresholds miss.

No result changes production state, runtime provider ordering, canonical
authority, persistence, release, or deployment. A supported result authorizes
only the next separately gated PoC decision.
