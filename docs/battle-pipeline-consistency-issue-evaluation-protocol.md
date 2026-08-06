# Battle Pipeline Consistency Issue PoC Evaluation Protocol

## Frozen scope

- Task: `T_ISSUES_EVAL`
- Fixture: `evidence/battle-pipeline-consistency-issue-fixtures-v1.json`
- Repetitions: 20 per scenario
- Runtime authority: unchanged; only shadow issue envelopes are mutated
- External LLM calls: zero
- XAI: not used because every conflict, duplicate, lifecycle event, and purpose
  classification has explicit structured ground truth

The frozen stream includes direct and subtle conflicts, an unrelated conflict,
exact and reordered duplicates, same-source stale replay, deferred and resolved
issues, recurrence after resolution, `no_issue_found`, `indeterminate`, and
ref-less audit findings from distinct sources.

## Measures

| Measure | Frozen threshold | Purpose |
|---|---:|---|
| Issue-observation recall | 100% | Register or deduplicate every seeded true conflict observation |
| False-positive rate | 0% | Do not promote no-issue or indeterminate inputs |
| Deduplication recall | 100% | Collapse every seeded duplicate unresolved conflict |
| Distinct-issue preservation | 100% | Keep overlapping, recurrent, and source-distinct findings separate |
| Stale replay no-op accuracy | 100% | Add no event or occurrence for exact source replay |
| Purpose-blocking accuracy | 100% | Match every final purpose-to-unresolved-issue set |
| Lifecycle traceability | 100% | Preserve expected event order, issue links, and source links |
| Actionable issue rate | 100% | Retain kind, provenance, lifecycle, and explicit purpose classification |
| Storage per unique issue | at most 4 KiB | Bound envelope growth including lifecycle evidence |
| Operator review inflation | at most 1.0 | Expose no more unresolved cards than current unique conflicts |
| Source mutations | 0 | Keep inputs and unrelated canonical state unchanged |
| Authority regressions | 0 | Prevent persistence, canonical commit, or runtime battle wiring |
| Global-coherence claims | 0 | Never infer whole-world coherence from issue status |

## Decision rubric

- `unsupported`: source immutability, purpose blocking, lifecycle traceability,
  authority, or no-global-coherence invariants fail.
- `revise`: hard invariants hold, but recall, false positives, deduplication,
  actionability, storage, or review burden misses a threshold.
- `supported`: every frozen invariant and effectiveness threshold passes.
- `indeterminate`: the frozen scenarios do not contain both true conflicts and
  non-conflict boundaries needed to calculate the decision.

A supported result is bounded lifecycle evidence only. It neither proves that
all contradictions are discoverable nor authorizes repair, persistence, or
`T_READ_POC`.
