# Battle observation KPI contract

Status: accepted observation contract as of 2026-08-13. This document defines
how evidence is read; it does not change battle behavior, authorize another
provider-backed observation, or by itself authorize a release or rollback.

## Decision model

Battle observation has three distinct layers. They must not be collapsed into
one score.

1. **Acceptance invariants** are per-run pass/fail checks. One failure rejects
   the observation as decision evidence even when the battle looks normal.
2. **Product KPIs** are version-bound cohort measures used to decide whether to
   keep, revise, or roll back a pacing or dialogue candidate.
3. **Diagnostic measures** help explain a change but are not goals by
   themselves. In particular, exact textual variety is not a substitute for a
   meaningful response to the counterpart or the current event.

Every report names its release, immutable battle policy and asset generations,
fixture or ordinary-production cohort, numerator, denominator, and missing
values. Fixed E2E battles and ordinary user battles are reported separately.
Unknown values stay unknown; zero is never substituted for missing token, cost,
semantic-response, or canonical-change evidence.

## Acceptance invariants

All of these must pass for each protected observation:

| Invariant | Required value |
| --- | ---: |
| Observation run and retained battle binding | exact match |
| Provider attempts without a classified layer | 0 |
| Reserved or nonterminal provider attempts after convergence | 0 |
| By-layer attempt sum minus ledger total | 0 |
| Narration physical attempts minus retained terminal attempts | 0 |
| Narration terminal attempts minus terminal receipts | 0 |
| Live narration delivery generations after convergence | 0 |
| Provider attempts above the approved ceiling | 0 |
| Finished battle, ordered narration, and history visibility | pass |
| General-character leakage from the test realm | 0 observed |

The approved provider-operation ceiling is a safety bound, not a performance
target. Using 99% of a ceiling can pass the invariant while still failing the
cost KPI.

## Product KPI registry

The initial bands below are provisional. Revisit them only from comparable
cohorts; do not retune a threshold to make one battle pass.

| KPI | Formula and aggregation | Target | Review trigger |
| --- | --- | ---: | ---: |
| Finish turn | combat turns per finished battle; report median and p90 | median 6–10 and p90 <= 12 | median > 10 or any policy-attributable turn 1–2 KO |
| Turn-limit rate | turn-limit finishes / finished battles | <= 10% | > 20% |
| Delayed-effect completion | due delayed effects resolved / due delayed effects | >= 95% | < 90% |
| Provider attempts per advance | physical attempts / completed advances, calculated per battle then cohort median | <= 6.0 | > 7.0 |
| Ceiling utilization | physical attempts / approved ceiling | < 80% | >= 80%; 100% is an invariant failure |
| Advance latency | completed advance wall time; report p50 and p95 | p95 <= 20 s | p95 > 25 s |
| Tokens per advance | returned total tokens / completed advances | baseline only | no band until a comparable cohort exists |
| Overall exact-unique rate | NFKC-normalized unique public lines / public lines, per battle then cohort median | >= 0.75 | < 0.65 |
| Worst-speaker exact-unique rate | minimum per-speaker unique lines / that speaker's lines | >= 0.60 | < 0.50 |
| Longest exact repeat run | maximum same-speaker identical run; counterpart turns do not break the speaker run | <= 2 | >= 4 |
| Semantic response rate | lines that address a new counterpart move or present result / eligible lines | pending evaluator | unavailable is reported, not inferred |
| Topic-progress rate | exchanges that advance, reframe, deliberately hold, or meaningfully withdraw / eligible exchanges | pending evaluator | unavailable is reported, not inferred |
| Meaningful canonical-change rate | combat turns with an accepted mechanical or semantic change / combat turns | pending retained classifier | unavailable is reported, not inferred from prose |

`reactionLines` and `nonReactionLinesAfterCounterpartUtterance` remain text-shape
diagnostics. A non-stage-reaction line can still ignore the counterpart, so
neither field is a semantic-response numerator.

The sanitized observer emits the directly measurable dialogue fields under
`dialogueQuality` schema version 2, including overall exact-unique rate,
worst-speaker exact-unique rate, and longest exact repeat run. Semantic response
and topic progress require an independently accepted evaluator with a frozen
rubric, model or human-review protocol, and budget. No extra provider call is
made solely to fill those fields.

## Cohort and decision boundary

- A single protected E2E battle is an operational acceptance result and a
  directional product signal only.
- A product-direction decision uses at least 20 separately authorized fixed
  fixture battles under one immutable release/configuration, or 30 naturally
  completed ordinary-production battles under that same configuration.
- Compare per-battle measures so a long battle does not silently dominate the
  dialogue, latency, or operation denominator.
- Historical mixed-version data is context, not the control cohort.
- A hard invariant can stop immediately. A provisional KPI review trigger
  opens diagnosis; it does not mechanically edit prompts, assets, or pacing.

## Current v0.17.4 reading

The bounded `v0.17.4` observation is one fixed-fixture battle, so this table is
a signal rather than an adoption decision.

| KPI | v0.17.4 | Reading |
| --- | ---: | --- |
| Acceptance invariants | all passed | usable observation |
| Finish turn | 9 of 12 | target band |
| Turn-limit / turn 1–2 KO | no / no | no trigger |
| Provider attempts per advance | 57 / 11 = 5.18 | target band |
| Ceiling utilization | 57 / 169 = 33.7% | target band |
| Tokens per advance | 260,247 / 11 = 23,658.8 | recorded; no comparable band |
| Advance latency p50 / p95 | 9.279 s / 12.238 s | target band for this sample |
| Overall exact-unique rate | 13 / 19 = 0.684 | between target and review trigger |
| Worst-speaker exact-unique rate | 3 / 9 = 0.333 | review trigger |
| Longest exact repeat run | 4 | review trigger |
| Semantic response / topic progress | unavailable | must not be inferred from exact uniqueness |

Compared with the immediately preceding fixed `v0.17.3` observation, overall
exact uniqueness improved from `11/19 = 0.579` to `13/19 = 0.684`. The worst
speaker still had a four-line exact run, so the aggregate improvement hides a
speaker-local regression: Nagi was `10/10` unique while Gaku was only `3/9`.
This is why both the aggregate and worst-speaker KPIs are required.

## Interpretation links

- [v0.17.4 production evidence](evidence/production-observation-0.17.4-2026-08-13.md)
- [v0.17.3 production evidence](evidence/production-observation-0.17.3-2026-08-13.md)
- [Historical production baseline](battle-pacing-production-baseline-2026-08-12.md)
- [Compact-dialogue RCA](dialogue-context-compact-rca.llmthink.dsl)
