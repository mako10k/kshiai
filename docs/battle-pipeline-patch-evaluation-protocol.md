# Battle Pipeline Canonical Patch PoC Evaluation Protocol

## Frozen scope

- Task: `T_PATCH_EVAL`
- Fixture: `evidence/battle-pipeline-patch-fixtures-v1.json`
- Repetitions: 20 per conversion fixture and defect seed
- Runtime authority: unchanged; the evaluator reads shadow outputs only
- External LLM calls: zero
- XAI: not used because every scored claim and injected defect is structured

The evaluation covers the selected mechanical, semantic, world, and accepted
free-action conversions. It also covers the intentional `indeterminate`
boundaries for missing prior fact references and new canonical identities.
It does not expand the converter's supported operation set.

## Measures

| Measure | Frozen threshold | Purpose |
|---|---:|---|
| Conversion classification accuracy | 100% | Preserve converted versus indeterminate boundaries |
| Reconstructed touched-state parity | 100% | Match authoritative post-state claims and retractions |
| Causal-source parity | 100% | Retain action, event, and transition attribution |
| Seeded-defect recall | 100% | Detect every explicitly represented audit defect |
| False rejection | 0 | Accept valid converted patches in complete contexts |
| Unexplained state changes | 0 | Prevent assertions or retractions absent from authoritative change |
| Authority regressions | 0 | Preserve subsystem owners and prevent runtime/commit wiring |
| Source mutations | 0 | Keep conversion and audit paths observational |
| Schema failures | 0 | Produce contract-valid conversion results and patches |
| Patch limit violations | 0 | Stay within bounded count and byte limits |
| Weighted audit-scope byte reduction | at least 30% | Test whether bounded audit input is materially smaller |

Scope reduction compares the serialized shadow patch plus its bounded current
fact/reference context with the serialized authoritative before state, after
state, accepted result, and impacted current facts. It is only a size proxy.

## Seeded defects

The frozen seeds exercise invalid schema, oversize, unknown reference, missing
retraction target, unretracted conflict, forbidden state, missing cause,
invalid causal relation, incomplete touched references, crossed authority, and
explicitly incomplete context. Recall is credited only when the expected issue
code and verdict are both returned.

## Decision rubric

- `unsupported`: classification, exact parity, causal attribution, source
  immutability, patch bounds, or authority preservation fails.
- `revise`: hard invariants hold, but defect recall, false rejection, or scope
  reduction misses its threshold.
- `supported`: every frozen hard invariant and proxy threshold passes.
- `indeterminate`: the frozen corpus cannot produce enough converted or seeded
  cases to calculate the decision.

A supported result is evidence for this bounded corpus only. It is not proof
of global consistency, correct final battle outcomes, or safe canonical commit.
It does not automatically unblock `T_ISSUES_POC`.
