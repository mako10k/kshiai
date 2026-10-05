# ADR-0054: Adequate waiting deadlines for new awareness battles

- Status: Accepted
- Date: 2026-10-05
- Decision owner: Repository owner
- Related: ADR0051 observed usage, ADR0052 isolated long measurement, ADR0053 response repair; speech-continuity-and-fade-recovery.pert

## Context

Owner requests 「待機期限を十分な時間に調整してください」. Ordinary subconscious5s/conscious15s were shorter than observed real responses. The prior isolated long-timeout trial received every SDK response with subconscious60s/conscious90s/other60s. It did not prove real combat completion.

## Decision drivers

- Allow the measured response times with substantial finite margin.
- Keep SDK, execution, canonical and narration deadlines consistent.
- Preserve already-bound policies, pricing uncertainty and retry limits.

## Considered options

1. Extend SDK only: persisted execution can expire earlier.
2. Change existing policy literals: would reinterpret immutable stored battles.
3. Bind a new observed timing revision to new battles: selected.

## Decision

New ordinary consciousness pipeline awareness-v5 battles bind operating/accounting policy awareness-v5-usage-v2. Subconscious60s, conscious90s, adjudication/encounter60s, narration60s; global duration600s, narration publication180s, terminal drain90s. This replaces the new-creation default policy selector from ADR0051, without altering its observed usage accounting or other obligations. Existing policies retain their exact values.

Keep maxTicks36, attempt ceiling200, concurrency6, model routes, output token caps, reassessment intervals, no automatic transport retry/fallback and money-unknown handling. Finite longer deadlines do not promise every future response or full battle completion. Creation, manifest/runtime, dispatch proof and actual provider request all use the same bound policy. Model-provider calls accept explicit invocation policy rather than applying a globally newer default to old battles. Narration already accepts its persisted policy.

## Consequences

### Positive

- The observed 3.8–7.3s subconscious and 20.3–25.8s conscious calls fit normal deadlines.
- Global/publication limits no longer preempt those extended role waits at the old shorter limits.

### Negative and risks

- Failed or slow requests can wait longer, and real full-path acceptance remains unverified.
- This sample is not a latency percentile or reliability guarantee; output-token and physical-attempt limits remain the economic controls, with unknown money explicit.

## Compatibility and migration

New ordinary creation only. Read old awareness-v5-trial-v1, usage-v1 and measurement-v1 unchanged. Do not migrate existing battles or rewrite explicit historical trial candidate policy/hash. Isolated long-measurement mode remains available. No deployment or paid call is included.

## Verification

Strict policy identity and rejection of mixed revision/limits; persisted new-default manifest/runtime; SDK/admission/render policy match; old explicit policies still dispatch their original limits through the same provider; narration and overall timing; full test/typecheck/build.

## Implementation references

- Previous real measurement: docs/evidence/awareness-long-timeout-measurement-2026-10-05.json
- Current task: normal-waiting-deadlines
