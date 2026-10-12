# ADR-0076: Reject invalid individual action updates with feedback

- Status: Accepted
- Revision: 1
- Date: 2026-10-12
- Decision owner: Repository owner
- Authority: [canonical decision](0076-reserved-invalid-action-feedback.think)
- Related: ADR0072 revision1; ADR0075 revision1; docs/unified-consciousness.pert

## Context

Application v0.25.0-rc.5 Stage38189337992 committed eight turns, using36physical attempts. The ninth adjudication charged4MP when only1MP remained. The reducer correctly rejected negative resources and atomically left the turn uncommitted. Cumulative attempts across five fixtures are97. Production remains application v0.24.0-rc.9.

## Decision drivers

Preserve strict canonical state while avoiding whole-battle termination for a single infeasible action. Deliver a clear failure reason to subsequent character decisions without another LLM call. Retain historical semantics and invalid raw evidence.

## Considered options

1. Prompt clarification alone: inexpensive but cannot ensure every arithmetic/reference error is avoided.
2. Clamp resources or accept invalid world changes: rejected because intended effects and costs would be silently altered.
3. Versioned automatic canonical repair, per-action failure and error-directed correction: selected.

## Decision

Introduce reserved turn policy v5/output v3/prompt v5 for new battles. Keep raw received responses privately. Parse strict whole-trace structure and require an exact unique reservation ID set. When identity is unambiguous, canonicalize order, side and baseRevision from server-owned reservations. Never invent a missing action or map an unknown/duplicate ID. Such ambiguous or malformed responses receive one error-directed corrective adjudication call on the same frozen input. If that received correction is still invalid, synthesize failure receipts with no physical updates and acting-side diagnostic feedback so the turn can continue. Normal turns remain four calls; one corrective call is exceptional and physically accounted.

For each structurally valid result, attempt its updates against the current working world. If canonical application rejects resources or world operations, reject all updates for that reservation, produce a server-owned failure receipt with an error code and feedback to the acting side, and continue the remaining ordered reservations from the unchanged world. No clamping or invented success; these deterministic repairs require no extra LLM call. Advance receipt and world revision metadata exactly once through the existing empty transition, as with other outcomes; physical world fields and resources remain unchanged. Canonical type/reference/resource checks remain authoritative.

When an earlier accepted update defeats/incapacitates an actor, later non-cancelled results become server-owned cancelled receipts with no updates. If a model returned cancelled with updates, discard those updates and emit a server-owned cancellation reason. A success with nonempty updates that has no actual canonical effect becomes a failure receipt. Information-only success remains legal under ADR0075.

Persist the effective trace atomically with the world, memory and observer feedback; retain the original raw trace separately. Discard model observations for rejected/cancelled results because they may describe effects that were never applied. The acting side receives a server-owned failure/cancellation reason; other-side and public observations are empty. Narration consumes only effective public consequences, without revealing rejected private intents or costs. Old policies/output contracts retain their existing all-or-nothing rejection rules, and old prompt bytes are unchanged.

Tighten prompt v5 to explicitly fail unaffordable skills, never charge below zero, and simulate balances after each accepted reservation. The server remains the final integrity check. Existing policy v4 soft/hard timing, four normal calls,36turns and physical ceilings remain. Policy v5 adds maxAdjudicationCorrections=1 per turn. A correction shares the original adjudication hard deadline (including known429 retries), never resets it, and gets its own durable receipt. Only physically received invalid responses qualify; unknown network sends, timeout or fencing errors are never correction-replayed. Preserve diagnostics and raw responses privately. A used invalid receipt must be physically closed and tagged ADJUDICATION_INVALID, which is explicitly permitted by commit and completion verification under policy v5.

Owner acceptance2026-10-12: 「裁定の間違いは、機械判定できる部分は自動修復やエラー明示でのやり直しにすべきですよね。裁定は完璧ではないのは当たり前です。」 This directs implementation of recovery rather than waiting for another confirmation. Existing explicit repair-retry authority and 「対戦、試行、切り替えまで承認」 continue for the corrected candidate within the remaining cumulative ceiling. Paid acceptance scope after repair: one additional fixed battle, max38advances/164physical attempts, cumulative261maximum preserved after97used; unpriced. No automatic rerun or character generation. Successful Stage precedes the already authorized production switch.

## Consequences

A rejected reservation produces usable feedback instead of stopping the battle. Later model results may have been reasoned from a rejected effect; canonical validation continues, but tactical quality is not guaranteed. Failed raw output is retained for audit. Malformed inputs never mutate the world; bounded correction or explicit failure feedback replaces whole-battle termination for adjudication validation errors. Infrastructure/fencing/deadline and authorized physical-budget boundaries remain unchanged.

## Compatibility and migration

No database migration or historical rebinding. Bind new policy/output/prompt together and validate persisted effective traces under their frozen version. Preserve all five failed fixtures. Do not replay unknown sends or rewrite prior evidence.

## Verification

Regression tests cover insufficient MP (1 minus4), all-or-nothing per-reservation effects, subsequent order and base revision, private feedback and public narration, invalid references, no-op effects, defeat cancellation, malformed whole trace, old-policy strict behavior, exact raw evidence preservation, four-call deterministic repair, fifth-call correction, correction replay/no duplicate sends, capped fallback, shared deadline and unknown-send refusal. Full governed PostgreSQL suite, individual authority reviews, typecheck/build/static and exact-source CI precede new immutable candidate and paid Stage.

## Implementation notes

Owner clarification: failed reservations consume their original slot and are discarded, without replacement or character replanning. Prompt v5 makes the opportunity cost explicit and lets existing character personality guide cautious, speculative or planned reservation choices. There is no flat additional resource penalty for failure; actual costs and side effects remain adjudicated.

Policy v5 adjudication receipts persist logicalStartedAt so the same deadline survives process restart and corrected-response replay.

## References

- https://github.com/mako10k/kshiai/actions/runs/38189337992
- docs/evidence/reserved-turns-rc5-failure-2026-10-12.json
