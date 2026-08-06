# Battle Pipeline Adaptive Adjudication PoC Evaluation Protocol

## Frozen scope

- Task: `T_ADAPTIVE_EVAL`
- Fixture: `evidence/battle-pipeline-adaptive-adjudication-fixtures-v1.json`
- Deterministic repetitions: 20 per scenario
- Blind review: five semantic scenarios, four order-balanced comparisons each
- Control: explicit coarse outcome supplied by each frozen scenario
- Intervention: committed shadow adaptive adjudicator at `4ae0601`
- Runtime authority: unchanged; receipts cannot commit canonical state
- XAI: a bounded blinded rubric judge, never an adjudicator or source of facts

The evaluator must retain raw scenario receipts and every judge response. The
scenario ID is visible to evidence readers but not used as an A/B label. For
each reviewed scenario, the adaptive candidate appears as A twice and B twice.
Preferences are normalized back to control/adaptive only after validation.

## Measures and thresholds

| Measure | Threshold |
|---|---:|
| Fast-path outcome parity | 100% |
| Expansion trigger precision | at least 0.80 |
| Expansion trigger recall | at least 0.80 |
| Partial-prefix correctness | 100% |
| Causal trace completeness | at least 0.98 |
| Known-fact contradiction reduction | at least 0.30 |
| Unsupported-assertion reduction | at least 0.30 |
| Budget degradation correctness | 100% |
| Blind adaptive preference share | at least 0.60 |
| Blind explanation-score delta | at least +0.25 |
| Valid blind judgment coverage | at least 0.90 |
| Order-pair consistency | at least 0.75 |
| p95 shadow latency | at most 25 ms |
| Source size | at most 1,200 lines and 40 exported declarations |

Preference share counts a tie as one half for each candidate and excludes an
indeterminate judgment. Coverage prevents exclusions from creating a pass.
Order consistency compares normalized preferences from paired A/B reversals.

## Hard invariants

- schema-valid input and output;
- no source mutation;
- no canonical commit or runtime integration;
- no fast-path control mismatch;
- no adjudicator-invented out-of-scope tactic;
- no cost attributed to an uncompleted step;
- no external LLM call by the shadow adjudicator;
- judge output never changes a receipt or hard score.

## Blind rubric

The judge receives only frozen context and candidates A/B. It scores:

- consistency with known facts and rules;
- whether action, effect, and cost have an understandable causal chain;
- unsupported assertions;
- whether unknown state is left uncertain rather than decided for convenience;
- overall local plausibility.

This is a semantic proxy, not an oracle for the objectively correct battle
result. Judge calls, tokens, latency, errors, provider, and model are reported
separately from the pipeline call budget.

## Decision rubric

- `unsupported`: a hard invariant fails, or control materially dominates the
  primary blind proxy without a bounded correction.
- `revise`: hard invariants hold but a deterministic, semantic, cost, or
  complexity threshold misses with a bounded correction.
- `supported`: every frozen hard invariant and threshold passes for this shadow
  mechanism.
- `indeterminate`: judge evidence is absent, invalid, below coverage, or cannot
  separate the candidates.

`supported` authorizes only the next frozen PoC decision. It does not authorize
runtime wiring, canonical commit, persistence, provider changes, or claim that
the final battle result is objectively correct. Character-plan generation and
expanded-path production token/latency remain separate limitations because the
PoC consumes pre-authored plans.
